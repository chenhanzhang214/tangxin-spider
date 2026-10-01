export const DEFAULT_DOWNLOAD_DIRECTORY = "C:\\Users\\Public\\Videos\\Tangxin";
export const DOWNLOAD_DIRECTORY_STORAGE_KEY = "tangxin.download-directory";
const MAX_DOWNLOAD_DIRECTORY_LENGTH = 512;

export function normalizeDownloadDirectory(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[A-Za-z]:[\\/]$/.test(trimmed) || trimmed === "/") return trimmed;
  return trimmed.replace(/[\\/]+$/g, "");
}

export function isValidDownloadDirectory(value: string) {
  const normalized = normalizeDownloadDirectory(value);
  if (!normalized || normalized.length > MAX_DOWNLOAD_DIRECTORY_LENGTH) return false;
  if (
    [...normalized].some((character) => {
      const code = character.charCodeAt(0);
      return code < 0x20;
    })
  ) {
    return false;
  }
  return (
    /^[A-Za-z]:[\\/]/.test(normalized) || /^\\\\/.test(normalized) || normalized.startsWith("/")
  );
}

export function parseStoredDownloadDirectory(value: string | null | undefined) {
  const normalized = normalizeDownloadDirectory(value ?? "");
  return isValidDownloadDirectory(normalized) ? normalized : DEFAULT_DOWNLOAD_DIRECTORY;
}

export function loadDownloadDirectory() {
  if (typeof window === "undefined") return DEFAULT_DOWNLOAD_DIRECTORY;
  try {
    return parseStoredDownloadDirectory(
      window.localStorage.getItem(DOWNLOAD_DIRECTORY_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_DOWNLOAD_DIRECTORY;
  }
}

export function persistDownloadDirectory(value: string) {
  const normalized = normalizeDownloadDirectory(value);
  if (!isValidDownloadDirectory(normalized)) return false;
  try {
    window.localStorage.setItem(DOWNLOAD_DIRECTORY_STORAGE_KEY, normalized);
    return true;
  } catch {
    return false;
  }
}
