import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { chooseLanPort, inspectLanServer, lanUrls, portCandidates } from "./lan-server.mjs";
import { lanStatusPlugin, projectIdentity } from "./lan-status-plugin.mjs";

async function listen(t, handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return server.address().port;
}

test("LAN launcher skips occupied ports without disturbing their listener", async (t) => {
  const occupied = await listen(t, (_request, response) => response.end("unrelated service"));
  const selected = await chooseLanPort(occupied);
  assert.notEqual(selected, occupied);
  assert.equal(
    await fetch(`http://127.0.0.1:${occupied}`).then((r) => r.text()),
    "unrelated service",
  );
});

test("LAN launcher only reuses a healthy server from the same project and version", async (t) => {
  const rootId = projectIdentity(process.cwd());
  const info = { app: "tangxin", projectId: rootId, version: "0.5.2", lan: true, managed: true };
  let pageVersion = "0.5.2";
  const port = await listen(t, (request, response) => {
    if (request.url === "/__tangxin/server-info") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(info));
    } else {
      response.end(`<title>糖心图谱</title>tangxinvlog.app v${pageVersion}`);
    }
  });
  assert.equal(await inspectLanServer(port, { projectId: rootId, version: "0.5.2" }), true);
  pageVersion = "0.5.1";
  assert.equal(await inspectLanServer(port, { projectId: rootId, version: "0.5.2" }), false);
  pageVersion = "0.5.2";
  assert.equal(await inspectLanServer(port, { projectId: rootId, version: "0.5.1" }), false);
  assert.equal(
    await inspectLanServer(port, { projectId: "different project", version: "0.5.2" }),
    false,
  );
  info.lan = false;
  assert.equal(await inspectLanServer(port, { projectId: rootId, version: "0.5.2" }), false);
  info.lan = true;
  info.managed = false;
  assert.equal(await inspectLanServer(port, { projectId: rootId, version: "0.5.2" }), false);
});

test("LAN launcher does not reuse unrelated HTML responses", async (t) => {
  const port = await listen(t, (_request, response) => response.end("<html>different app</html>"));
  assert.equal(await inspectLanServer(port, { projectId: "a", version: "0.5.2" }), false);
});

test("port arguments are bounded and LAN URLs omit internal and duplicate interfaces", () => {
  assert.deepEqual(portCandidates(65534, 3), [65534, 65535, 8080]);
  for (const value of ["8080 & echo unsafe", 0, -1, 65536, NaN])
    assert.throws(() => portCandidates(value));
  assert.deepEqual(
    lanUrls(8081, {
      loopback: [{ family: "IPv4", internal: true, address: "127.0.0.1" }],
      wifi: [{ family: "IPv4", internal: false, address: "192.168.1.2" }],
      other: [{ family: "IPv4", internal: false, address: "192.168.1.2" }],
    }),
    ["http://192.168.1.2:8081/"],
  );
});

test("status middleware exposes identity and version without the source directory", () => {
  let middleware;
  const root = process.cwd();
  lanStatusPlugin().configureServer({
    config: { root, server: { host: "0.0.0.0" } },
    middlewares: {
      use: (handler) => {
        middleware = handler;
      },
    },
  });
  const headers = {};
  let body;
  middleware(
    { url: "/__tangxin/server-info", method: "GET" },
    {
      setHeader: (name, value) => {
        headers[name] = value;
      },
      end: (value) => {
        body = value;
      },
    },
    () => assert.fail("Status request must be handled"),
  );
  const data = JSON.parse(body);
  assert.equal(data.app, "tangxin");
  assert.equal(data.projectId, projectIdentity(root));
  assert.equal(data.lan, true);
  assert.equal(headers["Cache-Control"], "no-store");
  assert.equal(body.includes(root), false);
  let nextCalled = false;
  middleware({ url: "/api/files", method: "GET" }, {}, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});
