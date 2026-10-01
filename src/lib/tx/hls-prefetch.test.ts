import assert from "node:assert/strict";
import { createCipheriv } from "node:crypto";
import { describe, it } from "node:test";
import {
  decryptHlsSegment,
  parseHlsMediaPlaylist,
  selectHlsMediaUrl,
} from "./hls-prefetch.ts";

describe("HLS parallel prefetch", () => {
  it("selects the highest-bandwidth media playlist from a master playlist", () => {
    const master = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
low/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2600000,RESOLUTION=1920x1080
https://media.example/high.m3u8
`;

    assert.equal(
      selectHlsMediaUrl("https://cdn.example/master.m3u8", master),
      "https://media.example/high.m3u8",
    );
  });

  it("parses AES-128 segments and keeps an explicit IV", () => {
    const playlist = `#EXTM3U
#EXT-X-MEDIA-SEQUENCE:7
#EXT-X-KEY:METHOD=AES-128,URI="enc.key",IV=0x0000000000000000000000000000002a
#EXTINF:4,
seg7.ts
#EXTINF:4,
https://other.example/seg8.ts
#EXT-X-ENDLIST
`;

    assert.deepEqual(
      parseHlsMediaPlaylist("https://cdn.example/video/index.m3u8", playlist),
      {
        segments: [
          {
            url: "https://cdn.example/video/seg7.ts",
            sequence: 7,
            key: {
              url: "https://cdn.example/video/enc.key",
              ivHex: "0000000000000000000000000000002a",
            },
          },
          {
            url: "https://other.example/seg8.ts",
            sequence: 8,
            key: {
              url: "https://cdn.example/video/enc.key",
              ivHex: "0000000000000000000000000000002a",
            },
          },
        ],
      },
    );
  });

  it("derives the IV from the media sequence and honours METHOD=NONE", () => {
    const playlist = `#EXTM3U
#EXT-X-MEDIA-SEQUENCE:15
#EXT-X-KEY:METHOD=AES-128,URI="key.bin"
#EXTINF:4,
encrypted.ts
#EXT-X-KEY:METHOD=NONE
#EXTINF:4,
plain.ts
`;

    const plan = parseHlsMediaPlaylist("https://cdn.example/index.m3u8", playlist);
    assert.equal(plan.segments[0]?.key?.ivHex, "0000000000000000000000000000000f");
    assert.equal(plan.segments[1]?.key, undefined);
  });

  it("rejects layouts that must fall back to ffmpeg direct mode", () => {
    assert.throws(
      () =>
        parseHlsMediaPlaylist(
          "https://cdn.example/index.m3u8",
          "#EXTM3U\n#EXT-X-BYTERANGE:1000@0\nseg.ts\n",
        ),
      /BYTERANGE/,
    );
    assert.throws(
      () =>
        parseHlsMediaPlaylist(
          "https://cdn.example/index.m3u8",
          '#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="key.bin"\nseg.ts\n',
        ),
      /SAMPLE-AES/,
    );
  });

  it("decrypts AES-128-CBC segments back to transport-stream bytes", () => {
    const key = Buffer.from("00112233445566778899aabbccddeeff", "hex");
    const iv = Buffer.from("0102030405060708090a0b0c0d0e0f10", "hex");
    const plain = Buffer.concat([Buffer.from([0x47]), Buffer.alloc(187, 0x5a)]);
    const cipher = createCipheriv("aes-128-cbc", key, iv);
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);

    assert.deepEqual(decryptHlsSegment(encrypted, key, iv.toString("hex")), plain);
  });
});
