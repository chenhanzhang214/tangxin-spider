import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createLanService, readLanPreference } from "./lan-service.mjs";

async function fixture(t, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), "tangxin-lan-"));
  const upstream = createServer((request, response) => {
    if (request.url === "/range") {
      response.writeHead(206, { "Content-Range": "bytes 1-3/5", "Content-Length": "3" });
      response.end("bcd");
    } else {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify({
            host: request.headers.host,
            origin: request.headers.origin,
            method: request.method,
            body,
          }),
        );
      });
    }
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const localUrl = `http://127.0.0.1:${upstream.address().port}`;
  const settingsPath = join(directory, "network.json");
  const service = createLanService({
    settingsPath,
    getTargetUrl: () => localUrl,
    getPreferredPort: () => 0,
    ...overrides,
  });
  t.after(async () => {
    await service.close();
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  });
  return { service, localUrl, settingsPath };
}

test("LAN starts disabled, forwards ranges and same-origin POST, then closes without stopping local service", async (t) => {
  const { service, localUrl, settingsPath } = await fixture(t);
  assert.equal((await service.restore()).enabled, false);
  const on = await service.setEnabled(true);
  assert.equal(on.enabled, true);
  assert.ok(on.port > 0);
  const remoteUrl = `http://127.0.0.1:${on.port}`;
  const range = await fetch(remoteUrl + "/range", { headers: { Range: "bytes=1-3" } });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get("content-range"), "bytes 1-3/5");
  assert.equal(await range.text(), "bcd");
  const response = await fetch(remoteUrl + "/save", {
    method: "POST",
    headers: { Origin: remoteUrl },
    body: "folder",
  });
  assert.deepEqual(await response.json(), {
    host: new URL(remoteUrl).host,
    origin: remoteUrl,
    method: "POST",
    body: "folder",
  });
  assert.equal(JSON.parse(readFileSync(settingsPath, "utf8")).lanEnabled, true);
  assert.equal((await service.setEnabled(false)).enabled, false);
  await assert.rejects(fetch(remoteUrl, { signal: AbortSignal.timeout(1000) }));
  assert.equal((await fetch(localUrl)).status, 200);
  assert.equal(readLanPreference(settingsPath), false);
});

test("LAN remembers the preference across launches and tolerates corrupt settings", async (t) => {
  const { service, settingsPath } = await fixture(t);
  writeFileSync(settingsPath, "invalid json");
  assert.equal(readLanPreference(settingsPath), false);
  await service.setEnabled(true);
  await service.close();
  assert.equal(readLanPreference(settingsPath), true);
  assert.equal((await service.restore()).enabled, true);
  await service.setEnabled(false);
  assert.equal((await service.restore()).enabled, false);
});

test("LAN retries a busy port and rejects invalid toggle values without changing state", async (t) => {
  const { service, localUrl } = await fixture(t, { getPreferredPort: () => 0 });
  await assert.rejects(service.setEnabled("false"), /开关/);
  assert.equal(service.status().enabled, false);
  const blocker = createServer();
  await new Promise((resolve) => blocker.listen(0, "0.0.0.0", resolve));
  const busyPort = blocker.address().port;
  const other = createLanService({
    settingsPath: join(tmpdir(), `tangxin-lan-busy-${process.pid}.json`),
    getTargetUrl: () => localUrl,
    getPreferredPort: () => busyPort,
  });
  t.after(async () => {
    await other.close();
    await new Promise((resolve) => blocker.close(resolve));
    rmSync(join(tmpdir(), `tangxin-lan-busy-${process.pid}.json`), { force: true });
  });
  const state = await other.setEnabled(true);
  assert.notEqual(state.port, busyPort);
  assert.notEqual(state.port, Number(new URL(localUrl).port));
  assert.equal((await fetch(localUrl)).status, 200);
});

test("LAN cannot proxy requests to an external target", async (t) => {
  const { service } = await fixture(t, { getTargetUrl: () => "http://untrusted.example:8080" });
  await assert.rejects(service.setEnabled(true), /本机/);
  assert.equal(service.status().enabled, false);
});

test("LAN rejects a foreign Host and leaves the local backend available", async (t) => {
  const { service, localUrl } = await fixture(t);
  const { port } = await service.setEnabled(true);
  const status = await new Promise((resolve, reject) => {
    const outgoing = request(
      { hostname: "127.0.0.1", port, headers: { Host: `untrusted.example:${port}` } },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode));
      },
    );
    outgoing.on("error", reject);
    outgoing.end();
  });
  assert.equal(status, 403);
  assert.equal((await fetch(localUrl)).status, 200);
});

test("LAN rolls back the listener if its preference cannot be saved", async (t) => {
  const { settingsPath, localUrl } = await fixture(t);
  writeFileSync(settingsPath, "not a directory");
  const service = createLanService({
    settingsPath: join(settingsPath, "settings.json"),
    getTargetUrl: () => localUrl,
    getPreferredPort: () => 0,
  });
  t.after(() => service.close());
  await assert.rejects(service.setEnabled(true), /无法保存/);
  assert.equal(service.status().enabled, false);
  assert.equal((await fetch(localUrl)).status, 200);
});
