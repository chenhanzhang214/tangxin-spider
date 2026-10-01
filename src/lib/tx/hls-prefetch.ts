import { createDecipheriv } from "node:crypto";

export type HlsKey = {
  url: string;
  ivHex: string;
};

export type HlsSegment = {
  url: string;
  sequence: number;
  key?: HlsKey;
};

export type HlsMediaPlan = {
  segments: HlsSegment[];
};

function parseAttributes(line: string) {
  const attributes = new Map<string, string>();
  const payload = line.slice(line.indexOf(":") + 1);
  for (const match of payload.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi)) {
    const key = match[1]?.toUpperCase();
    const raw = match[2] ?? "";
    if (!key) continue;
    attributes.set(key, raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw);
  }
  return attributes;
}

function resolveHttpUrl(baseUrl: string, value: string) {
  const url = new URL(value, baseUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`HLS 资源协议不受并发预取支持：${url.protocol}`);
  }
  return url.toString();
}

function normalizeIv(value: string) {
  const hex = value.replace(/^0x/i, "");
  if (!/^[0-9a-f]{1,32}$/i.test(hex)) {
    throw new Error("HLS AES-128 IV 无效");
  }
  return hex.toLowerCase().padStart(32, "0");
}

function sequenceIv(sequence: number) {
  return BigInt(sequence).toString(16).padStart(32, "0");
}

export function selectHlsMediaUrl(playlistUrl: string, playlist: string) {
  const lines = playlist.split(/\r?\n/);
  let selected: { bandwidth: number; url: string } | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;

    const attributes = parseAttributes(line);
    const bandwidth = Number(attributes.get("BANDWIDTH") ?? 0);
    let uri = "";
    for (let next = index + 1; next < lines.length; next += 1) {
      const candidate = lines[next]?.trim() ?? "";
      if (!candidate) continue;
      if (candidate.startsWith("#")) break;
      uri = candidate;
      break;
    }
    if (!uri) continue;

    const candidate = {
      bandwidth: Number.isFinite(bandwidth) ? bandwidth : 0,
      url: resolveHttpUrl(playlistUrl, uri),
    };
    if (!selected || candidate.bandwidth > selected.bandwidth) selected = candidate;
  }

  return selected?.url ?? null;
}

export function parseHlsMediaPlaylist(playlistUrl: string, playlist: string): HlsMediaPlan {
  const lines = playlist.split(/\r?\n/);
  if (!lines.some((line) => line.trim() === "#EXTM3U")) {
    throw new Error("响应不是有效的 HLS 播放列表");
  }
  if (lines.some((line) => line.trim().startsWith("#EXT-X-STREAM-INF:"))) {
    throw new Error("HLS 主播放列表需要先选择媒体流");
  }

  let mediaSequence = 0;
  let currentKey: { url: string; explicitIv?: string } | undefined;
  const segments: HlsSegment[] = [];

  for (const sourceLine of lines) {
    const line = sourceLine.trim();
    if (!line) continue;

    if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
      const parsed = Number(line.slice(line.indexOf(":") + 1));
      if (!Number.isSafeInteger(parsed) || parsed < 0) {
        throw new Error("HLS MEDIA-SEQUENCE 无效");
      }
      mediaSequence = parsed;
      continue;
    }

    if (line.startsWith("#EXT-X-KEY:")) {
      const attributes = parseAttributes(line);
      const method = attributes.get("METHOD")?.toUpperCase();
      if (method === "NONE") {
        currentKey = undefined;
        continue;
      }
      if (method !== "AES-128") {
        throw new Error(`HLS 加密方式 ${method || "未知"} 不支持并发预取`);
      }
      const keyFormat = attributes.get("KEYFORMAT");
      if (keyFormat && keyFormat !== "identity") {
        throw new Error(`HLS KEYFORMAT ${keyFormat} 不支持并发预取`);
      }
      const keyUri = attributes.get("URI");
      if (!keyUri) throw new Error("HLS AES-128 缺少密钥地址");
      const iv = attributes.get("IV");
      currentKey = {
        url: resolveHttpUrl(playlistUrl, keyUri),
        explicitIv: iv ? normalizeIv(iv) : undefined,
      };
      continue;
    }

    if (line.startsWith("#EXT-X-BYTERANGE:")) {
      throw new Error("HLS BYTERANGE 不支持并发预取");
    }
    if (line.startsWith("#EXT-X-MAP:")) {
      throw new Error("HLS fMP4 初始化分片不支持并发预取");
    }
    if (line === "#EXT-X-DISCONTINUITY") {
      throw new Error("HLS DISCONTINUITY 不支持并发预取");
    }
    if (line.startsWith("#")) continue;

    const sequence = mediaSequence + segments.length;
    const url = resolveHttpUrl(playlistUrl, line);
    if (/\.m3u8(?:$|[?#])/i.test(new URL(url).pathname)) {
      throw new Error("HLS 嵌套播放列表不支持直接作为分片");
    }
    segments.push({
      url,
      sequence,
      key: currentKey
        ? {
            url: currentKey.url,
            ivHex: currentKey.explicitIv ?? sequenceIv(sequence),
          }
        : undefined,
    });
    if (segments.length > 10_000) throw new Error("HLS 分片数量超过安全上限");
  }

  if (segments.length === 0) throw new Error("HLS 播放列表没有媒体分片");
  return { segments };
}

export function decryptHlsSegment(encrypted: Buffer, key: Buffer, ivHex: string) {
  if (key.length !== 16) throw new Error(`HLS AES-128 密钥长度无效：${key.length}`);
  if (!/^[0-9a-f]{32}$/i.test(ivHex)) throw new Error("HLS AES-128 IV 无效");
  const decipher = createDecipheriv("aes-128-cbc", key, Buffer.from(ivHex, "hex"));
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}
