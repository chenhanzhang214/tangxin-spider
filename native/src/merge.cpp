// Fixed-name, ordered segment concatenation. FFmpeg remains the media muxer.
#include <array>
#include <charconv>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>
#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#endif

namespace fs = std::filesystem;

class TemporaryOutput {
public:
    explicit TemporaryOutput(fs::path path) : path_(std::move(path)) {}
    ~TemporaryOutput() { std::error_code ignored; fs::remove(path_, ignored); }
private:
    fs::path path_;
};

int main() {
    try {
        std::string directory, count_text;
        if (!std::getline(std::cin, directory) || !std::getline(std::cin, count_text) || directory.size() > 32768)
            throw std::runtime_error("invalid request");
        int count = 0;
        const auto parsed = std::from_chars(count_text.data(), count_text.data() + count_text.size(), count);
        if (parsed.ec != std::errc{} || parsed.ptr != count_text.data() + count_text.size() || count < 1 || count > 100000)
            throw std::runtime_error("invalid segment count");
        const auto root = fs::u8path(directory);
        if (!root.is_absolute() || !fs::is_directory(root)) throw std::runtime_error("invalid working directory");
        const auto output = root / "input.ts";
        const auto temporary = root / "input.ts.merging";
        if (fs::exists(output) || fs::exists(temporary)) throw std::runtime_error("output already exists");
        std::vector<fs::path> segments;
        std::uintmax_t total = 0;
        for (int index = 0; index < count; ++index) {
            std::ostringstream name;
            name << "segment-" << std::setw(6) << std::setfill('0') << index << ".ts";
            const auto path = root / name.str();
            if (!fs::is_regular_file(fs::symlink_status(path)) || fs::file_size(path) == 0)
                throw std::runtime_error("missing or empty segment");
            total += fs::file_size(path);
            segments.push_back(path);
        }
        TemporaryOutput cleanup(temporary);
        std::ofstream destination(temporary, std::ios::binary | std::ios::trunc);
        if (!destination) throw std::runtime_error("cannot create temporary output");
        // Memory use is independent of segment/video size.
        std::array<char, 1024 * 1024> buffer{};
        std::uintmax_t bytes = 0;
        for (const auto& path : segments) {
            std::ifstream source(path, std::ios::binary);
            if (!source) throw std::runtime_error("cannot open segment");
            while (source) {
                source.read(buffer.data(), static_cast<std::streamsize>(buffer.size()));
                const auto read = source.gcount();
                destination.write(buffer.data(), read);
                if (!destination) throw std::runtime_error("cannot write output");
                bytes += static_cast<std::uintmax_t>(read);
            }
            if (!source.eof()) throw std::runtime_error("cannot read segment");
            std::cout << "{\"bytes\":" << bytes << ",\"totalBytes\":" << total << "}\n" << std::flush;
        }
        destination.close();
        if (!destination || bytes != total) throw std::runtime_error("incomplete output");
#ifdef _WIN32
        // No REPLACE_EXISTING: never overwrite a finished output.
        if (!MoveFileExW(temporary.c_str(), output.c_str(), MOVEFILE_WRITE_THROUGH))
            throw std::runtime_error("cannot publish output");
#else
        fs::create_hard_link(temporary, output);
#endif
        std::cout << "{\"done\":true,\"bytes\":" << bytes << ",\"totalBytes\":" << total << "}\n";
        return 0;
    } catch (const std::exception&) {
        std::cerr << "Segment merge failed: check inputs, free space and permissions.\n";
        return 1;
    }
}
