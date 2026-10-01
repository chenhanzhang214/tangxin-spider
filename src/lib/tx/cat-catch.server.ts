import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CAT_CATCH_EXTENSION_ID, catCatchM3u8Url } from "./cat-catch.ts";

const MAX_CAT_CATCH_INDEX = 100_000;
export const CAT_CATCH_LOCAL_ONLY_ERROR = "猫抓联动仅支持本机启动模式。";

type CatCatchInstallation = {
  profileName?: string;
  version: string;
};

export type CatCatchStatus =
  | {
      available: true;
      chromePath: string;
      profileName?: string;
      version: string;
    }
  | {
      available: false;
      error: string;
    };

export type CatCatchRuntime = {
  getStatus: () => CatCatchStatus;
  launch: (command: string, args: string[]) => Promise<void>;
};

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function existingPath(value: string | undefined) {
  const candidate = value?.trim();
  return candidate && existsSync(candidate) ? candidate : undefined;
}

function findChromePath() {
  const configured = existingPath(process.env.CHROME_PATH);
  if (configured) return configured;

  const roots = [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.LOCALAPPDATA,
  ].filter((value): value is string => Boolean(value));
  const candidates = roots.map((root) =>
    join(root, "Google", "Chrome", "Application", "chrome.exe"),
  );
  return candidates.find((candidate) => existsSync(candidate));
}

function extensionParserExists(directory: string) {
  return existsSync(join(directory, "m3u8.html"));
}

function versionDirectories(directory: string) {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && extensionParserExists(join(directory, entry.name)))
      .map((entry) => entry.name)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  } catch {
    return [];
  }
}

function profileNames(userDataDirectory: string) {
  const names = ["Default"];
  try {
    const discovered = readdirSync(userDataDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^Profile \d+$/.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const name of discovered) {
      if (!names.includes(name)) names.push(name);
    }
  } catch {
    // A missing or locked profile directory is handled as “not installed”.
  }
  return names;
}

function findCatCatchInstallation(): CatCatchInstallation | undefined {
  const configuredDirectory = process.env.CAT_CATCH_EXTENSION_DIR?.trim();
  if (configuredDirectory && extensionParserExists(configuredDirectory)) {
    return { version: configuredDirectory.split(/[\\/]/).pop() || "已安装" };
  }

  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (!localAppData) return undefined;

  const userDataDirectory =
    process.env.CHROME_USER_DATA_DIR?.trim() || join(localAppData, "Google", "Chrome", "User Data");
  for (const profileName of profileNames(userDataDirectory)) {
    const extensionDirectory = join(
      userDataDirectory,
      profileName,
      "Extensions",
      CAT_CATCH_EXTENSION_ID,
    );
    const version = versionDirectories(extensionDirectory)[0];
    if (version) return { profileName, version };
  }
  return undefined;
}

export function getCatCatchStatus(): CatCatchStatus {
  if (process.platform !== "win32" || process.env.VERCEL === "1") {
    return { available: false, error: CAT_CATCH_LOCAL_ONLY_ERROR };
  }

  const chromePath = findChromePath();
  if (!chromePath) {
    return { available: false, error: "未找到可启动的 Google Chrome。" };
  }

  const installation = findCatCatchInstallation();
  if (!installation) {
    return {
      available: false,
      error: `未在 Chrome 中找到猫抓扩展（${CAT_CATCH_EXTENSION_ID}）。`,
    };
  }

  return {
    available: true,
    chromePath,
    profileName: installation.profileName,
    version: installation.version,
  };
}

function launchChrome(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
    } catch (error) {
      reject(error);
      return;
    }

    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

const defaultRuntime: CatCatchRuntime = {
  getStatus: getCatCatchStatus,
  launch: launchChrome,
};

function validId(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,20}$/.test(value);
}

function parseIndex(value: unknown) {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
  if (!/^\d+$/.test(text)) return null;
  const index = Number(text);
  return Number.isSafeInteger(index) && index >= 1 && index <= MAX_CAT_CATCH_INDEX ? index : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function publicStatus(status: CatCatchStatus) {
  return status.available
    ? { available: true, version: status.version }
    : { available: false, error: status.error };
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

export async function handleCatCatchRequest(
  request: Request,
  runtime: CatCatchRuntime = defaultRuntime,
) {
  const url = new URL(request.url);
  if (!isSameOrigin(request)) {
    return json({ error: "猫抓联动只接受当前应用的请求" }, 403);
  }
  if (url.searchParams.get("status") === "1") {
    return json(publicStatus(runtime.getStatus()));
  }

  if (request.method !== "POST") {
    return json({ error: "请使用 POST 请求打开猫抓解析器" }, 405);
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return json({ error: "请求体不是有效 JSON" }, 400);
  }

  const id = isRecord(input) ? input.id : undefined;
  const actor = isRecord(input) && typeof input.actor === "string" ? input.actor.trim() : "";
  const index = parseIndex(isRecord(input) ? input.index : undefined);
  const title =
    isRecord(input) && typeof input.title === "string" ? input.title.trim().slice(0, 200) : undefined;

  if (!validId(id)) {
    return json({ error: "视频 ID 无效，只允许数字 ID" }, 400);
  }
  if (!actor || actor.length > 200 || index === null) {
    return json({ error: "演员和正整数编号是必需的" }, 400);
  }

  const status = runtime.getStatus();
  if (!status.available) return json({ error: status.error }, 503);

  const target = catCatchM3u8Url(id, actor, index, title);
  const args = [
    ...(status.profileName ? [`--profile-directory=${status.profileName}`] : []),
    "--new-tab",
    target,
  ];

  try {
    await runtime.launch(status.chromePath, args);
  } catch (error) {
    const detail = errorMessage(error);
    console.error(`[cat-catch] Chrome launch failed: ${detail}`);
    return json({ error: "无法打开 Chrome 猫抓解析器，请确认 Chrome 可正常启动。" }, 502);
  }

  return json({
    ok: true,
    version: status.version,
    message: "已在 Chrome 中打开猫抓 M3U8 解析器",
  });
}
