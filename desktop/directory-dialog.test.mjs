import assert from "node:assert/strict";
import { test } from "node:test";
import { registerDirectoryPicker } from "./directory-dialog.mjs";

function setup(showOpenDialog) {
  let handler;
  const mainFrame = { url: "http://127.0.0.1:8090/" };
  const webContents = { mainFrame };
  const window = { webContents, isDestroyed: () => false };
  registerDirectoryPicker({
    ipcMain: { handle: (_channel, callback) => { handler = callback; } },
    dialog: { showOpenDialog },
    getWindow: () => window,
    getServerUrl: () => "http://127.0.0.1:8090/",
    getDefaultPath: () => "C:\\Downloads",
  });
  return { handler, window, event: { sender: webContents, senderFrame: mainFrame } };
}

test("returns a complete Unicode folder path using a parented directory-only dialog", async () => {
  const selected = "E:\\示例用户\\文档\\spider";
  let options;
  let parent;
  const fixture = setup(async (window, settings) => {
    parent = window;
    options = settings;
    return { canceled: false, filePaths: [selected] };
  });
  assert.equal(await fixture.handler(fixture.event, selected), selected);
  assert.equal(parent, fixture.window);
  assert.equal(options.defaultPath, selected);
  assert.deepEqual(options.properties, ["openDirectory", "dontAddToRecent"]);
});

test("cancel preserves the existing folder and invalid dialog paths use a default", async () => {
  let options;
  const fixture = setup(async (_window, settings) => {
    options = settings;
    return { canceled: true, filePaths: [] };
  });
  assert.equal(await fixture.handler(fixture.event, "relative-folder"), null);
  assert.equal(options.defaultPath, "C:\\Downloads");
});

test("rejects another window, iframe and external origin before opening a dialog", async () => {
  let calls = 0;
  const fixture = setup(async () => { calls += 1; });
  await assert.rejects(fixture.handler({ ...fixture.event, sender: {} }, "E:\\Videos"));
  await assert.rejects(fixture.handler({ ...fixture.event, senderFrame: { url: fixture.event.senderFrame.url } }, "E:\\Videos"));
  fixture.event.senderFrame.url = "https://untrusted.example/";
  await assert.rejects(fixture.handler(fixture.event, "E:\\Videos"));
  assert.equal(calls, 0);
});

test("dialog errors do not prevent retrying", async () => {
  let calls = 0;
  const fixture = setup(async () => {
    if (++calls === 1) throw new Error("dialog failed");
    return { canceled: false, filePaths: ["E:\\Videos"] };
  });
  await assert.rejects(fixture.handler(fixture.event, "E:\\Videos"));
  assert.equal(await fixture.handler(fixture.event, "E:\\Videos"), "E:\\Videos");
});

test("a pending folder dialog cannot open a second dialog", async () => {
  let finish;
  let calls = 0;
  const fixture = setup(() => {
    calls += 1;
    return new Promise((resolve) => { finish = resolve; });
  });
  const first = fixture.handler(fixture.event, "E:\\Videos");
  assert.equal(await fixture.handler(fixture.event, "E:\\Videos"), null);
  assert.equal(calls, 1);
  finish({ canceled: true, filePaths: [] });
  assert.equal(await first, null);
});
