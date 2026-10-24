export function requireDesktopFrame(event, window, serverUrl) {
  if (
    !window ||
    window.isDestroyed() ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame
  )
    throw new Error("不允许此页面操作桌面设置。");
  try {
    if (new URL(event.senderFrame.url).origin === new URL(serverUrl).origin) return;
  } catch {
    /* Invalid or detached frames are never trusted. */
  }
  throw new Error("不允许此页面操作桌面设置。");
}
