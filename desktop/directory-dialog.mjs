import { isAbsolute } from "node:path";

export function registerDirectoryPicker({ ipcMain, dialog, getWindow, getServerUrl, getDefaultPath }) {
  let selecting = false;
  ipcMain.handle("tangxin:select-download-directory", async (event, currentDirectory) => {
    const window = getWindow();
    if (
      !window || window.isDestroyed() ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      new URL(event.senderFrame.url).origin !== new URL(getServerUrl()).origin
    ) {
      throw new Error("不允许此页面选择下载目录。");
    }
    if (selecting) return null;
    const defaultPath = typeof currentDirectory === "string" &&
      currentDirectory.length <= 512 && isAbsolute(currentDirectory) &&
      ![...currentDirectory].some((character) => character.charCodeAt(0) < 0x20)
      ? currentDirectory : getDefaultPath();
    selecting = true;
    try {
      const result = await dialog.showOpenDialog(window, {
        title: "选择 MP4 保存文件夹",
        defaultPath,
        buttonLabel: "选择此文件夹",
        properties: ["openDirectory", "dontAddToRecent"],
      });
      return result.canceled ? null : result.filePaths[0] ?? null;
    } finally {
      selecting = false;
    }
  });
}
