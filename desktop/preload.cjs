/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tangxinDesktop", {
  selectDownloadDirectory: (currentDirectory) =>
    ipcRenderer.invoke("tangxin:select-download-directory", currentDirectory),
});
