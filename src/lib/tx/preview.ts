export function videoPreviewUrl(id: string, path = "index.m3u8") {
  return `/api/preview?${new URLSearchParams({ id, path })}`;
}
