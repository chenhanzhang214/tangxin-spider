export function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function saveBlob(content: Blob | BlobPart, filename: string, type: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function friendlyLoadError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/fetch failed|timeout|timed out|ECONNRESET|ENETUNREACH/i.test(message)) {
    return "源站暂时不可达，请检查网络或稍后点击刷新页面重试。";
  }
  return message || "加载失败";
}
