import assert from "node:assert/strict";
import { test } from "node:test";
import { registerLanService } from "./lan-ipc.mjs";

test("only the desktop main frame can read or change the LAN switch", async () => {
  const handlers = new Map();
  const frame = { url: "http://127.0.0.1:8080/" };
  const contents = { mainFrame: frame };
  const event = { sender: contents, senderFrame: frame };
  const window = { webContents: contents, isDestroyed: () => false };
  let enabled = false;
  registerLanService({
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    getWindow: () => window,
    getServerUrl: () => "http://127.0.0.1:8080/",
    service: {
      status: () => ({ enabled }),
      setEnabled: async (value) => {
        enabled = value;
        return { enabled };
      },
    },
  });
  const read = handlers.get("tangxin:lan-status");
  const write = handlers.get("tangxin:lan-enabled");
  assert.deepEqual(await read(event), { enabled: false });
  assert.deepEqual(await write(event, true), { enabled: true });
  for (const bad of [
    { ...event, sender: {} },
    { ...event, senderFrame: { url: frame.url } },
  ]) {
    await assert.rejects(read(bad), /不允许/);
    await assert.rejects(write(bad, false), /不允许/);
  }
  frame.url = "https://untrusted.example/";
  await assert.rejects(write(event, false), /不允许/);
  assert.equal(enabled, true);
});
