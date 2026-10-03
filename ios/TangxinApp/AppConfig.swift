import Foundation

enum AppConfig {
    static let displayName = "糖心图谱"

    static var webAppURL: URL? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "TangxinWebAppURL") as? String else {
            return nil
        }

        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, !value.hasPrefix("$(") else { return nil }
        guard let url = URL(string: value), url.scheme == "https" || url.scheme == "http" else {
            return nil
        }
        return url
    }
}
