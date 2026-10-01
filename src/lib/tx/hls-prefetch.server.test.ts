import assert from "node:assert/strict";
import { createCipheriv } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { prefetchHlsToTransportStream } from "./hls-prefetch.server.ts";

function encrypt(plain: Buffer, key: Buffer, iv: Buffer) {
  const cipher = createCipheriv("aes-128-cbc", key, iv);
  return Buffer.concat([cipher.update(plain), cipher.final()]);
}

describe("HLS prefetch server", () => {
  it("downloads segments concurrently, decrypts them, and joins them in playlist order", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tx-hls-prefetch-"));
    const key = Buffer.from("00112233445566778899aabbccddeeff", "hex");
    const iv = Buffer.from("0102030405060708090a0b0c0d0e0f10", "hex");
    const plain = [
      Buffer.concat([Buffer.from([0x47]), Buffer.alloc(187, 0x11)]),
      Buffer.concat([Buffer.from([0x47]), Buffer.alloc(187, 0x22)]),
      Buffer.concat([Buffer.from([0x47]), Buffer.alloc(187, 0x33)]),
    ];
    const resources = new Map<string, BodyInit>([
      [
        "https://cdn.example/index.m3u8",
        `#EXTM3U
#EXT-X-KEY:METHOD=AES-128,URI="enc.key",IV=0x${iv.toString("hex")}
#EXTINF:4,
seg0.ts
#EXTINF:4,
seg1.ts
#EXTINF:4,
seg2.ts
#EXT-X-ENDLIST
`,
      ],
      ["https://cdn.example/enc.key", key],
      ["https://cdn.example/seg0.ts", encrypt(plain[0]!, key, iv)],
      ["https://cdn.example/seg1.ts", encrypt(plain[1]!, key, iv)],
      ["https://cdn.example/seg2.ts", encrypt(plain[2]!, key, iv)],
    ]);
    let activeSegments = 0;
    let peakSegments = 0;
    const progress: Array<{
      phase: string;
      completedSegments: number;
      totalSegments: number;
    }> = [];
    const fetchImpl = async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);
      const body = resources.get(url);
      if (body === undefined) return new Response("missing", { status: 404 });
      if (url.endsWith(".ts")) {
        activeSegments += 1;
        peakSegments = Math.max(peakSegments, activeSegments);
        await new Promise((resolve) => setTimeout(resolve, 15));
        activeSegments -= 1;
      }
      return new Response(body, { status: 200 });
    };

    try {
      const result = await prefetchHlsToTransportStream({
        playlistUrl: "https://cdn.example/index.m3u8",
        workingDirectory: directory,
        concurrency: 2,
        retries: 1,
        fetchImpl: fetchImpl as typeof fetch,
        onProgress: (event) => progress.push(event),
      });

      assert.equal(result.segmentCount, 3);
      assert.equal(result.concurrency, 2);
      assert.equal(result.bytes, 188 * 3);
      assert.equal(peakSegments, 2);
      assert.deepEqual(await readFile(result.transportPath), Buffer.concat(plain));
      assert.equal(progress[0]?.phase, "playlist");
      assert.equal(progress.at(-1)?.phase, "merging");
      assert.deepEqual(progress.find((event) => event.completedSegments === 3), {
        phase: "segments",
        completedSegments: 3,
        totalSegments: 3,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("retries a transient segment failure", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tx-hls-retry-"));
    let attempts = 0;
    const fetchImpl = async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith("index.m3u8")) {
        return new Response("#EXTM3U\n#EXTINF:4,\nseg0.ts\n#EXT-X-ENDLIST\n");
      }
      attempts += 1;
      return attempts === 1
        ? new Response("try again", { status: 503 })
        : new Response(Buffer.concat([Buffer.from([0x47]), Buffer.alloc(187)]));
    };

    try {
      const result = await prefetchHlsToTransportStream({
        playlistUrl: "https://cdn.example/index.m3u8",
        workingDirectory: directory,
        concurrency: 1,
        retries: 2,
        fetchImpl: fetchImpl as typeof fetch,
      });
      assert.equal(attempts, 2);
      assert.equal(result.bytes, 188);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not let a playlist redirect segment requests to another host", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tx-hls-host-"));
    const fetchImpl = async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith("index.m3u8")) {
        return new Response("#EXTM3U\n#EXTINF:4,\nhttps://private.example/seg0.ts\n#EXT-X-ENDLIST\n");
      }
      return new Response("unexpected", { status: 200 });
    };

    try {
      await assert.rejects(
        prefetchHlsToTransportStream({
          playlistUrl: "https://cdn.example/index.m3u8",
          workingDirectory: directory,
          fetchImpl: fetchImpl as typeof fetch,
        }),
        /不在允许范围/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
