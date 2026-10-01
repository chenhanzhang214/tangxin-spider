import { hlsUrl, SITE_ORIGIN } from "./types.ts";

export const FFMPEG_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function remuxOutputArgs(output: string) {
  const pipeOutput = output === "-" || output.startsWith("pipe:");
  return [
    "-map",
    "0:v:0?",
    "-map",
    "0:a:0?",
    "-c",
    "copy",
    "-bsf:a",
    "aac_adtstoasc",
    "-movflags",
    pipeOutput ? "frag_keyframe+empty_moov" : "+faststart",
    "-f",
    "mp4",
    output,
  ];
}

export function buildFfmpegArgs(id: string, output = "pipe:1") {
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-protocol_whitelist",
    "file,http,https,tcp,tls,crypto",
    "-headers",
    `Referer: ${SITE_ORIGIN}/\r\nUser-Agent: ${FFMPEG_USER_AGENT}\r\n`,
    "-i",
    hlsUrl(id),
    ...remuxOutputArgs(output),
  ];
}

export function buildLocalFfmpegArgs(input: string, output: string) {
  return [
    "-y",
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    input,
    ...remuxOutputArgs(output),
  ];
}

export function sanitizeFilename(value: string, fallback = "video") {
  const normalized = Array.from(value.normalize("NFKC"), (char) => {
    const code = char.charCodeAt(0);
    return code < 32 || /[<>:"/\\|?*]/.test(char) ? "_" : char;
  })
    .join("")
    .replace(/[. ]+$/g, "")
    .trim();
  return normalized.slice(0, 100) || fallback;
}

const WINDOWS_RESERVED_BASENAME = /^(?:CON|PRN|AUX|NUL|CLOCK\$|COM[1-9]|LPT[1-9])(?:\..*)?$/i;

export function sanitizeVideoTitle(value: string, fallback = "未命名视频") {
  const filename = sanitizeFilename(value, fallback);
  return WINDOWS_RESERVED_BASENAME.test(filename) ? `_${filename}` : filename;
}

export function videoMp4Url(
  id: string,
  actor?: string,
  index?: number,
  downloadDirectory?: string,
  progress = false,
  title?: string,
) {
  const params = new URLSearchParams({ id });
  if (actor) params.set("actor", actor);
  if (Number.isInteger(index) && (index as number) > 0) {
    params.set("index", String(index));
  }
  if (downloadDirectory?.trim()) params.set("downloadDir", downloadDirectory.trim());
  if (progress) params.set("progress", "1");
  if (title?.trim()) params.set("title", title.trim());
  return `/api/mp4?${params.toString()}`;
}
