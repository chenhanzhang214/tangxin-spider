import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import {
  DEFAULT_DOWNLOAD_DIRECTORY,
  isValidDownloadDirectory,
  normalizeDownloadDirectory,
} from "./download-settings.ts";

const configuredPath = process.env.TX_DOWNLOAD_DIR_CONFIG?.trim();
const CONFIG_FILE =
  configuredPath && isAbsolute(configuredPath)
    ? resolve(configuredPath)
    : join(process.cwd(), ".tangxin-download-dir");
let cachedDir: string | null = null;

export function getServerDownloadDirectory(): string {
  const envDir = normalizeDownloadDirectory(process.env.TX_DOWNLOAD_DIR ?? "");
  if (isValidDownloadDirectory(envDir)) {
    return envDir;
  }
  if (cachedDir) return cachedDir;
  try {
    if (existsSync(CONFIG_FILE)) {
      const saved = readFileSync(CONFIG_FILE, "utf8").trim();
      if (isValidDownloadDirectory(saved)) {
        cachedDir = saved;
        return saved;
      }
    }
  } catch {
    // ignore read error
  }
  return DEFAULT_DOWNLOAD_DIRECTORY;
}

export function setServerDownloadDirectory(newDir: string | null): boolean {
  if (newDir === null) {
    cachedDir = null;
    try {
      if (existsSync(CONFIG_FILE)) unlinkSync(CONFIG_FILE);
    } catch {
      // ignore
    }
    return true;
  }
  const normalized = normalizeDownloadDirectory(newDir);
  if (!isValidDownloadDirectory(normalized)) return false;
  try {
    writeFileSync(CONFIG_FILE, normalized, "utf8");
  } catch {
    // writing might fail in read-only locations, still cache in memory
  }
  cachedDir = normalized;
  return true;
}

export function getLocalIpv4Addresses(): string[] {
  const nets = networkInterfaces();
  const results: string[] = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        results.push(net.address);
      }
    }
  }
  return results;
}
