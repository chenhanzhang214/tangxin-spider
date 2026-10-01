import { hlsUrl, SITE_ORIGIN } from "./types.ts";
import { sanitizeFilename } from "./mp4-utils.ts";

export const CAT_CATCH_EXTENSION_ID = "jfedfbgedapdagkghmgibemcoggfppbb";
export const CAT_CATCH_M3U8_PATH = "m3u8.html";

export function catCatchM3u8Url(
  id: string,
  actor?: string,
  index?: number,
  title?: string,
) {
  const params = new URLSearchParams({
    url: hlsUrl(id),
    requestHeaders: JSON.stringify({ referer: `${SITE_ORIGIN}/` }),
  });
  if (title?.trim()) params.set("title", title.trim());
  if (actor?.trim() && Number.isInteger(index) && (index as number) > 0) {
    params.set("filename", `${sanitizeFilename(actor)}/${index}`);
  }
  return `chrome-extension://${CAT_CATCH_EXTENSION_ID}/${CAT_CATCH_M3U8_PATH}?${params}`;
}
