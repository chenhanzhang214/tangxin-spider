/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tangxinDesktop", {
  getLanServiceStatus: () => ipcRenderer.invoke("tangxin:lan-status"),
  setLanServiceEnabled: (enabled) => ipcRenderer.invoke("tangxin:lan-enabled", enabled),
  selectDownloadDirectory: (currentDirectory) =>
    ipcRenderer.invoke("tangxin:select-download-directory", currentDirectory),
});
