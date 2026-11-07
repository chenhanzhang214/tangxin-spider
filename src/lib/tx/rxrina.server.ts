import { createDecipheriv, randomBytes } from "node:crypto";
import { PAGE_SIZE } from "./types.ts";
import {
  mapRxrinaDetail,
  mapRxrinaHome,
  mapRxrinaList,
  mapRxrinaSearch,
  parseSiteConfigScript,
  type RxrinaPublicConfig,
} from "./rxrina-catalog.ts";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// The anonymous page unwraps catalog JSON with these public client values.
// They are not user credentials and are never sent as a login secret.
const RESPONSE_KEY = "C6DvClCIsrp6t5cMQRlLAxJItxt5H7WT";
const RESPONSE_IV = "VLMQmNqzTnq18DjXwap3HSFrW76uIHoU";

const configCache = new Map<string, Promise<RxrinaPublicConfig>>();
const homeInflight = new Map<string, Promise<ReturnType<typeof mapRxrinaHome>>>();

export function resetRxrinaRequestCache() {
  configCache.clear();
  homeInflight.clear();
}

export function decryptRxrinaPayload(encoded: string) {
  try {
    const decipher = createDecipheriv(
      "aes-256-cbc",
      Buffer.from(RESPONSE_KEY, "utf8"),
      Buffer.from(RESPONSE_IV, "utf8").subarray(0, 16),
    );
    const json = Buffer.concat([
      decipher.update(Buffer.from(encoded, "base64")),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(json) as unknown;
  } catch {
    throw new Error("内容源目录无法解析");
  }
}

async function readCatalog(origin: string, path: string, fetchImpl: typeof fetch) {
  const url = new URL(path, origin);
  if (url.origin !== origin) throw new Error("内容源地址无效");
  const response = await fetchImpl(url, {
    headers: {
      "User-Agent": UA,
      Accept: path.endsWith(".js") ? "*/*" : "application/json",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.6",
      Referer: `${origin}/`,
      authwebtoken: randomBytes(32).toString("hex"),
      "X-Site-Id": url.hostname,
      version: "1",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(18_000),
  });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new Error("内容源拒绝跳转到其他地址");
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`请求失败 ${response.status} ${url.pathname}`);
  }
  const body = await response.text();
  if (path.endsWith(".js")) return body;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    throw new Error("内容源返回了无法识别的目录");
  }
  const envelope = parsed && typeof parsed === "object" ? (parsed as { "x-data"?: unknown }) : null;
  const data =
    envelope && typeof envelope["x-data"] === "string" ? decryptRxrinaPayload(envelope["x-data"]) : parsed;
  if (!data || typeof data !== "object") throw new Error("内容源返回了无法识别的目录");
  const status = data as { code?: unknown; msg?: unknown };
  if (status.code === 401) throw new Error("内容源要求登录，已停止，不会尝试绕过访问控制。");
  if (typeof status.code === "number" && status.code !== 200) {
    throw new Error(typeof status.msg === "string" && status.msg ? status.msg : `内容源返回错误 ${status.code}`);
  }
  return data;
}

async function loadConfig(origin: string, fetchImpl: typeof fetch) {
  const cached = configCache.get(origin);
  if (cached) return cached;
  const pending = (async () => {
    const source = await readCatalog(origin, "/server/web/site/config.js", fetchImpl);
    if (typeof source !== "string") throw new Error("内容源配置缺少站点参数");
    return parseSiteConfigScript(source);
  })().catch((error: unknown) => {
    if (configCache.get(origin) === pending) configCache.delete(origin);
    throw error;
  });
  configCache.set(origin, pending);
  return pending;
}

export async function loadRxrinaHomeBundle(origin: string, fetchImpl: typeof fetch = fetch) {
  const existing = homeInflight.get(origin);
  if (existing) return existing;
  const pending = (async () => {
    const config = await loadConfig(origin, fetchImpl);
    const payload = await readCatalog(origin, "/server/web/index", fetchImpl);
    return mapRxrinaHome(payload, origin, config);
  })().finally(() => {
    if (homeInflight.get(origin) === pending) homeInflight.delete(origin);
  });
  homeInflight.set(origin, pending);
  return pending;
}

async function loadList(
  origin: string,
  params: Record<string, string>,
  fetchImpl: typeof fetch,
) {
  const config = await loadConfig(origin, fetchImpl);
  const query = new URLSearchParams({ pageSize: String(PAGE_SIZE), ...params });
  const payload = await readCatalog(origin, `/server/movie/list?${query.toString()}`, fetchImpl);
  return { payload, config };
}

export async function fetchRxrinaActorPage(
  origin: string,
  slug: string,
  page: number,
  fetchImpl: typeof fetch = fetch,
) {
  const { payload, config } = await loadList(
    origin,
    { columnValue: slug, pageNum: String(page) },
    fetchImpl,
  );
  return mapRxrinaList(payload, origin, slug, page, config);
}

export async function fetchRxrinaTagPage(
  origin: string,
  slug: string,
  page: number,
  fetchImpl: typeof fetch = fetch,
) {
  const { payload, config } = await loadList(
    origin,
    { genres: slug, pageNum: String(page) },
    fetchImpl,
  );
  const pageResult = mapRxrinaList(payload, origin, slug, page, config, slug);
  return pageResult;
}

export async function fetchRxrinaSearch(
  origin: string,
  query: string,
  limit: number,
  fetchImpl: typeof fetch = fetch,
) {
  const config = await loadConfig(origin, fetchImpl);
  const params = new URLSearchParams({
    keyword: query,
    pageNum: "1",
    pageSize: String(Math.max(1, Math.min(100, limit))),
  });
  const payload = await readCatalog(origin, `/server/movie/list?${params.toString()}`, fetchImpl);
  return mapRxrinaSearch(payload, origin, query, limit, config);
}

export async function fetchRxrinaVideoDetail(
  origin: string,
  id: string,
  fetchImpl: typeof fetch = fetch,
) {
  const config = await loadConfig(origin, fetchImpl);
  const payload = await readCatalog(origin, `/server/movie/videos/${encodeURIComponent(id)}`, fetchImpl);
  return mapRxrinaDetail(payload, origin, id, config);
}
