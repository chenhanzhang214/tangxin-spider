import { requireDesktopFrame } from "./ipc-security.mjs";

export function registerLanService({ ipcMain, getWindow, getServerUrl, service }) {
  ipcMain.handle("tangxin:lan-status", async (event) => {
    requireDesktopFrame(event, getWindow(), getServerUrl());
    return service.status();
  });
  ipcMain.handle("tangxin:lan-enabled", async (event, enabled) => {
    requireDesktopFrame(event, getWindow(), getServerUrl());
    if (typeof enabled !== "boolean") throw new Error("局域网开关参数无效。");
    return service.setEnabled(enabled);
  });
}
