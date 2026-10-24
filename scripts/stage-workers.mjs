import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";

const runtime = resolve(".runtime-downloads/python-3.14.8-embed-amd64.zip");
const digest = "a93abe456ab01bd96d7a085b3cdb6566b3063f4241360d114142fbdb07f0a310";
const native = resolve("native/build/tangxin-media.exe");
if (
  !existsSync(runtime) ||
  createHash("sha256").update(readFileSync(runtime)).digest("hex") !== digest
)
  throw new Error("缺少已校验的 Python 3.14.8 运行时，请按 README 使用 Clash 下载后再构建。");
if (!existsSync(native)) throw new Error("请先执行 npm run native:build");
const root = resolve(".output/worker");
mkdirSync(root, { recursive: true });
const pythonRoot = join(root, "python");
mkdirSync(pythonRoot, { recursive: true });
// Archive is a pinned official artifact; no downloads or machine-wide installs here.
const expanded = spawnSync("tar.exe", ["-xf", runtime, "-C", pythonRoot], {
  windowsHide: true,
  stdio: "inherit",
});
if (expanded.status !== 0) throw new Error("Python 运行时解压失败");
cpSync("backend/tangxin", join(root, "backend/tangxin"), {
  recursive: true,
  filter: (path) => !path.includes("__pycache__"),
});
copyFileSync("backend/worker.py", join(root, "backend/worker.py"));
copyFileSync(native, join(root, "tangxin-media.exe"));
console.log("[desktop] Python + C++ workers staged");
