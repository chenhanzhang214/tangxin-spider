import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync, rmSync, symlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleFilesRequest } from "./files.server.ts";
import { setServerDownloadDirectory } from "./download-settings.server.ts";

test("files API: listing, path traversal check, and directory sync", async (t) => {
  const previousEnv = process.env.TX_DOWNLOAD_DIR;
  delete process.env.TX_DOWNLOAD_DIR;

  const testRoot = join(tmpdir(), `tx-test-files-${Date.now()}`);
  mkdirSync(join(testRoot, "测试演员"), { recursive: true });
  writeFileSync(join(testRoot, "测试演员", "视频1.mp4"), "fake mp4 content 1234567890");

  setServerDownloadDirectory(testRoot);

  t.after(() => {
    setServerDownloadDirectory(null);
    if (previousEnv !== undefined) {
      process.env.TX_DOWNLOAD_DIR = previousEnv;
    } else {
      delete process.env.TX_DOWNLOAD_DIR;
    }
    try {
      rmSync(testRoot, { recursive: true, force: true });
    } catch {
      // ignore cleanup error
    }
  });

  await t.test("GET /api/files?dir=1 returns root and localIps", async () => {
    const req = new Request("http://localhost:8080/api/files?dir=1");
    const res = await handleFilesRequest(req);
    assert.equal(res.status, 200);
    const data = (await res.json()) as { root: string; localIps: string[]; port: number };
    assert.equal(data.root, testRoot);
    assert.ok(Array.isArray(data.localIps));
    assert.equal(data.port, 8080);
  });

  await t.test(
    "directory info uses the visible LAN port rather than the backend port",
    async () => {
      const response = await handleFilesRequest(
        new Request("http://192.168.1.2:8081/api/files?dir=1"),
      );
      assert.equal(((await response.json()) as { port: number }).port, 8081);
    },
  );

  await t.test("GET /api/files?list=1 lists actor folders and files", async () => {
    const req = new Request("http://localhost:8080/api/files?list=1");
    const res = await handleFilesRequest(req);
    assert.equal(res.status, 200);
    const data = (await res.json()) as Array<{
      actor: string;
      count: number;
      files: Array<{ name: string }>;
    }>;
    assert.equal(data.length, 1);
    assert.equal(data[0].actor, "测试演员");
    assert.equal(data[0].count, 1);
    assert.equal(data[0].files[0].name, "视频1.mp4");
  });

  await t.test("GET /api/files?actor=测试演员&file=视频1.mp4 supports Range requests", async () => {
    const req = new Request("http://localhost:8080/api/files?actor=测试演员&file=视频1.mp4", {
      headers: { Range: "bytes=0-3" },
    });
    const res = await handleFilesRequest(req);
    assert.equal(res.status, 206);
    assert.equal(res.headers.get("Content-Range"), "bytes 0-3/27");
    assert.equal(res.headers.get("Content-Type"), "video/mp4");
    const text = await res.text();
    assert.equal(text, "fake");
  });

  await t.test("rejects path traversal attempts", async () => {
    const req = new Request("http://localhost:8080/api/files?actor=../../etc&file=passwd.mp4");
    const res = await handleFilesRequest(req);
    // safeActor is basename("../../etc") = "etc", which doesn't exist in testRoot
    assert.equal(res.status, 404);
  });

  await t.test(
    "rejects parent paths, alternate streams and directory junctions for reads and deletes",
    async () => {
      const outside = `${testRoot}-outside`;
      mkdirSync(outside, { recursive: true });
      writeFileSync(join(outside, "private.mp4"), "private");
      const parentFile = `tx-private-${process.pid}-${Date.now()}.mp4`;
      const parentPath = join(testRoot, "..", parentFile);
      writeFileSync(parentPath, "private");
      try {
        for (const method of ["GET", "DELETE"]) {
          const res = await handleFilesRequest(
            new Request(
              `http://localhost:8080/api/files?${new URLSearchParams({ actor: "..", file: parentFile })}`,
              { method },
            ),
          );
          assert.equal(res.status, 404, `${method} parent`);
        }
        symlinkSync(
          outside,
          join(testRoot, "linked"),
          process.platform === "win32" ? "junction" : "dir",
        );
        for (const actor of [".", "../测试演员", "linked"]) {
          for (const method of ["GET", "DELETE"]) {
            const res = await handleFilesRequest(
              new Request(
                `http://localhost:8080/api/files?${new URLSearchParams({ actor, file: "private.mp4" })}`,
                { method },
              ),
            );
            assert.equal(res.status, 404, `${method} ${actor}`);
          }
        }
        const res = await handleFilesRequest(
          new Request("http://localhost:8080/api/files?actor=测试演员&file=视频1.mp4:stream.mp4"),
        );
        assert.equal(res.status, 404);
        assert.ok(existsSync(join(outside, "private.mp4")));
      } finally {
        rmSync(join(testRoot, "linked"), { recursive: true, force: true });
        rmSync(outside, { recursive: true, force: true });
        rmSync(parentPath, { force: true });
      }
    },
  );

  await t.test(
    "supports suffix ranges, clamps long ranges and rejects reversed or malformed ranges",
    async () => {
      for (const [range, expected, content] of [
        ["bytes=-4", "bytes 23-26/27", "7890"],
        ["bytes=23-999", "bytes 23-26/27", "7890"],
        ["bytes=0-3", "bytes 0-3/27", "fake"],
      ]) {
        const response = await handleFilesRequest(
          new Request("http://localhost:8080/api/files?actor=测试演员&file=视频1.mp4", {
            headers: { Range: range },
          }),
        );
        assert.equal(response.status, 206);
        assert.equal(response.headers.get("content-range"), expected);
        assert.equal(await response.text(), content);
      }
      for (const range of [
        "bytes=5-2",
        "bytes=27-",
        "bytes=-0",
        "bytes=0-1,3-4",
        "bytes=999999999999999999999-",
        "junkbytes=0-1",
      ]) {
        const response = await handleFilesRequest(
          new Request("http://localhost:8080/api/files?actor=测试演员&file=视频1.mp4", {
            headers: { Range: range },
          }),
        );
        assert.equal(response.status, 416, range);
        assert.equal(response.headers.get("content-range"), "bytes */27");
      }
    },
  );

  await t.test(
    "rejects cross-site reads and mutations while allowing same-origin LAN requests",
    async () => {
      for (const method of ["GET", "POST", "DELETE"]) {
        const response = await handleFilesRequest(
          new Request("http://localhost:8080/api/files?dir=1", {
            method,
            headers: { Origin: "https://untrusted.example" },
          }),
        );
        assert.equal(response.status, 403);
      }
      const response = await handleFilesRequest(
        new Request("http://192.168.1.2:8080/api/files?dir=1", {
          headers: { Origin: "http://192.168.1.2:8080", "Sec-Fetch-Site": "same-origin" },
        }),
      );
      assert.equal(response.status, 200);
    },
  );

  await t.test("POST /api/files updates the download directory", async () => {
    const newDir = join(tmpdir(), "tx-new-dir");
    const req = new Request("http://localhost:8080/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ downloadDir: newDir }),
    });
    const res = await handleFilesRequest(req);
    assert.equal(res.status, 200);
    const data = (await res.json()) as { ok: boolean; root: string };
    assert.equal(data.ok, true);
    assert.equal(data.root, newDir);
  });
});
