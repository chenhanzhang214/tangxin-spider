import type { DownloadProgressUpdate } from "./download-progress";

export type Mp4SaveResult = {
  ok: true;
  path: string;
  bytes: number;
  message: string;
};

type Mp4ProgressStreamMessage =
  | ({ type: "progress" } & DownloadProgressUpdate)
  | { type: "result"; data: Mp4SaveResult }
  | { type: "error"; error: string };

function responseError(payload: unknown, status: number) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  return `MP4 下载失败（${status}）`;
}

function isMp4SaveResult(payload: unknown): payload is Mp4SaveResult {
  return (
    payload !== null &&
    payload !== undefined &&
    typeof payload === "object" &&
    "ok" in payload &&
    payload.ok === true &&
    "path" in payload &&
    typeof payload.path === "string" &&
    "bytes" in payload &&
    typeof payload.bytes === "number" &&
    "message" in payload &&
    typeof payload.message === "string"
  );
}

async function readProgressStream(
  response: Response,
  onProgress?: (update: DownloadProgressUpdate) => void,
) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("当前环境无法读取 MP4 实时进度");

  const decoder = new TextDecoder();
  const state: { result: Mp4SaveResult | null } = { result: null };
  let buffer = "";

  function consume(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;

    const message = JSON.parse(trimmed) as Mp4ProgressStreamMessage;
    if (message.type === "progress") {
      onProgress?.(message);
      return;
    }
    if (message.type === "error") throw new Error(message.error);
    if (message.type === "result") state.result = message.data;
  }

  while (true) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) consume(line);

    if (done) break;
  }

  buffer += decoder.decode();
  consume(buffer);
  if (!isMp4SaveResult(state.result)) throw new Error("MP4 进度流没有返回保存位置");
  return state.result;
}

export async function readMp4Response(
  response: Response,
  onProgress?: (update: DownloadProgressUpdate) => void,
): Promise<Mp4SaveResult> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (response.ok && contentType.includes("application/x-ndjson")) {
    return readProgressStream(response, onProgress);
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) throw new Error(responseError(payload, response.status));
  if (!isMp4SaveResult(payload)) throw new Error("MP4 已生成但没有返回保存位置");
  return payload;
}
