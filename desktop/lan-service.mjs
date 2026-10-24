import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { localIpv4Addresses, openLanGateway } from "./lan-gateway.mjs";

export function readLanPreference(settingsPath) {
  try {
    return JSON.parse(readFileSync(settingsPath, "utf8")).lanEnabled === true;
  } catch {
    return false;
  }
}

function savePreference(settingsPath, enabled) {
  mkdirSync(dirname(settingsPath), { recursive: true });
  const temporary = `${settingsPath}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify({ lanEnabled: enabled }) + "\n", { mode: 0o600 });
    renameSync(temporary, settingsPath);
  } finally {
    if (existsSync(temporary)) rmSync(temporary);
  }
}

export function createLanService({ settingsPath, getTargetUrl, getPreferredPort }) {
  let gateway = null;
  let changing = false;
  let error;
  const status = () => ({
    enabled: Boolean(gateway),
    port: gateway?.port ?? null,
    urls: gateway ? localIpv4Addresses().map((ip) => `http://${ip}:${gateway.port}`) : [],
    ...(error ? { error } : {}),
  });
  async function setEnabled(enabled) {
    if (typeof enabled !== "boolean") throw new Error("局域网开关参数无效。");
    if (changing) throw new Error("局域网服务正在切换，请稍后重试。");
    if (enabled === Boolean(gateway)) return status();
    changing = true;
    try {
      if (enabled) {
        const opened = await openLanGateway(getTargetUrl(), getPreferredPort());
        try {
          savePreference(settingsPath, true);
        } catch {
          await opened.close();
          throw new Error("无法保存局域网设置，请检查配置目录权限。");
        }
        gateway = opened;
      } else {
        savePreference(settingsPath, false);
        await gateway.close();
        gateway = null;
      }
      error = undefined;
      return status();
    } catch (failure) {
      error = failure.message;
      throw failure;
    } finally {
      changing = false;
    }
  }
  return {
    status,
    setEnabled,
    async restore() {
      if (readLanPreference(settingsPath)) {
        try {
          await setEnabled(true);
        } catch {
          /* The local window remains usable and shows the status error. */
        }
      }
      return status();
    },
    async close() {
      if (gateway) {
        await gateway.close();
        gateway = null;
      }
    },
  };
}
