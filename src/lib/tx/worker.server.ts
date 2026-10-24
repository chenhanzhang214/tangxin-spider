import { spawn, type ChildProcess } from "node:child_process";
import { isAbsolute, join } from "node:path";

const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;
const activeChildren = new Set<ChildProcess>();
process.once("exit", () => {
  for (const child of activeChildren) child.kill();
});

export type WorkerOptions = { root?: string; pythonPath?: string; timeoutMs?: number };
export type PythonOperation = "health" | "home" | "cloud" | "page" | "detail" | "archive";
export type MergeProgress = { bytes: number; totalBytes: number; done?: boolean };
export class NativeWorkerError extends Error {}

export function desktopWorkerEnabled() {
  return Boolean(process.env.TX_WORKER_ROOT);
}

/** Fixed executable/argument arrays only. No source-site data reaches a shell. */
export function runWorkerProcess(
  executable: string,
  args: string[],
  input: string,
  timeoutMs: number,
  onLine?: (line: string) => void,
): Promise<string> {
  if (Buffer.byteLength(input) > MAX_MESSAGE_BYTES)
    return Promise.reject(new Error("工作进程请求过大"));
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      shell: false,
      stdio: ["pipe", "pipe", "ignore"],
    });
    activeChildren.add(child);
    let output = "",
      lineBuffer = "",
      bytes = 0,
      failure: Error | null = null;
    const fail = (error: Error) => {
      failure ??= error;
      child.kill();
    };
    const timer = setTimeout(() => fail(new Error("本地工作进程超时，请重试")), timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_MESSAGE_BYTES) {
        fail(new Error("工作进程响应过大"));
        return;
      }
      output += chunk;
      if (!onLine) return;
      lineBuffer += chunk;
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() ?? "";
      try {
        for (const line of lines) if (line.trim()) onLine(line);
      } catch {
        fail(new Error("工作进程进度数据无效"));
      }
    });
    child.on("error", () => {
      failure = new Error("无法启动内置工作进程，请重新安装完整版");
    });
    child.stdin.on("error", () => {
      fail(new Error("无法向工作进程发送请求"));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      activeChildren.delete(child);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error("本地工作进程失败，请检查输入、磁盘空间和文件权限"));
      else resolve(output);
    });
    child.stdin.end(input, "utf8");
  });
}

export async function runPython<T>(
  op: PythonOperation,
  payload: object,
  options: WorkerOptions = {},
): Promise<T> {
  if (!["health", "home", "cloud", "page", "detail", "archive"].includes(op))
    throw new Error("未知工作进程操作");
  const root = options.root ?? process.env.TX_WORKER_ROOT;
  if (!root || !isAbsolute(root)) throw new Error("未配置本地工作进程");
  const executable = options.pythonPath ?? join(root, "python", "python.exe");
  const raw = await runWorkerProcess(
    executable,
    ["-I", "-B", join(root, "backend", "worker.py")],
    JSON.stringify({ version: 1, op, payload }),
    options.timeoutMs ?? 15_000,
  );
  let reply;
  try {
    reply = JSON.parse(raw);
  } catch {
    throw new Error("目录服务响应格式无效");
  }
  if (reply?.version !== 1 || reply?.ok !== true || !("result" in reply))
    throw new Error("目录服务协议不兼容");
  return reply.result as T;
}

export async function mergeNativeSegments(
  directory: string,
  count: number,
  onProgress?: (progress: MergeProgress) => void,
) {
  const root = process.env.TX_WORKER_ROOT;
  if (
    !root ||
    !isAbsolute(root) ||
    !isAbsolute(directory) ||
    /[\r\n\0]/.test(directory) ||
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > 100000
  )
    throw new Error("分片合并参数无效");
  let final: MergeProgress | undefined;
  await runWorkerProcess(
    join(root, "tangxin-media.exe"),
    [],
    `${directory}\n${count}\n`,
    300_000,
    (line) => {
      const event = JSON.parse(line) as MergeProgress;
      if (
        !Number.isSafeInteger(event.bytes) ||
        !Number.isSafeInteger(event.totalBytes) ||
        event.bytes < 0 ||
        event.bytes > event.totalBytes
      )
        throw new Error("无效进度");
      if (event.done) final = event;
      onProgress?.(event);
    },
  ).catch((error: Error) => {
    throw new NativeWorkerError(error.message);
  });
  if (!final || final.bytes !== final.totalBytes) throw new NativeWorkerError("本地分片合并未完成");
  return final.bytes;
}
