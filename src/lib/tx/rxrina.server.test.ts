import assert from "node:assert/strict";
import { createCipheriv } from "node:crypto";
import { describe, it } from "node:test";
import { RXRINA_SITE_ORIGIN } from "./site-origin.ts";
import {
  decryptRxrinaPayload,
  fetchRxrinaActorPage,
  loadRxrinaHomeBundle,
  resetRxrinaRequestCache,
} from "./rxrina.server.ts";

const KEY = Buffer.from("C6DvClCIsrp6t5cMQRlLAxJItxt5H7WT", "utf8");
const IV = Buffer.from("VLMQmNqzTnq18DjXwap3HSFrW76uIHoU", "utf8").subarray(0, 16);

function encrypt(value: unknown) {
  const cipher = createCipheriv("aes-256-cbc", KEY, IV);
  return Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]).toString("base64");
}

const configScript =
  'window.__SITE_CONFIG__ = {"title":"测试目录","version":"1","resimgcdn":"https://img.example","bufnamecdn":"COVER_RES","bufdomaincdn":"$domain","resimgdomaincdn":"https://img.example"};';

function responseFor(url: URL, bodies: Record<string, unknown>, statuses: Record<string, number> = {}) {
  const key = url.pathname;
  const status = statuses[key] ?? 200;
  if (status >= 300 && status < 400) return new Response(null, { status, headers: { Location: "https://evil.example/" } });
  const body = key.endsWith(".js") ? configScript : JSON.stringify({ "x-data": encrypt(bodies[key]) });
  return new Response(body, { status, headers: { "Content-Type": key.endsWith(".js") ? "application/javascript" : "application/json" } });
}

describe("3drxrina public catalog client", () => {
  it("round-trips the public response wrapper", () => {
    assert.deepEqual(decryptRxrinaPayload(encrypt({ code: 200, rows: [] })), { code: 200, rows: [] });
    assert.throws(() => decryptRxrinaPayload("not-valid"), /内容源目录无法解析/);
  });

  it("loads the homepage once for concurrent callers and refuses redirects or login", async () => {
    resetRxrinaRequestCache();
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      calls.push(url.pathname);
      const headers = new Headers(init?.headers);
      assert.equal(url.origin, RXRINA_SITE_ORIGIN);
      assert.equal(headers.get("Authorization"), null);
      assert.ok(headers.get("authwebtoken"));
      assert.equal(headers.get("X-Site-Id"), url.hostname);
      return responseFor(url, {
        "/server/web/index": {
          code: 200,
          data: { queryData: [{ name: "测试栏目", value: "push_1", genres: [], rows: [] }] },
        },
      });
    };
    const [first, second] = await Promise.all([
      loadRxrinaHomeBundle(RXRINA_SITE_ORIGIN, fetchImpl),
      loadRxrinaHomeBundle(RXRINA_SITE_ORIGIN, fetchImpl),
    ]);
    assert.equal(first.home.title, "测试目录");
    assert.equal(second.actors[0]?.slug, "push_1");
    assert.deepEqual(calls.filter((path) => path === "/server/web/index"), ["/server/web/index"]);

    resetRxrinaRequestCache();
    const redirecting: typeof fetch = async (input) => responseFor(new URL(String(input)), {}, { "/server/web/site/config.js": 302 });
    await assert.rejects(loadRxrinaHomeBundle(RXRINA_SITE_ORIGIN, redirecting), /拒绝跳转/);

    resetRxrinaRequestCache();
    const login: typeof fetch = async (input) =>
      responseFor(new URL(String(input)), { "/server/web/index": { code: 401, msg: "登录" } });
    await assert.rejects(loadRxrinaHomeBundle(RXRINA_SITE_ORIGIN, login), /不会尝试绕过访问控制/);
  });

  it("requests one column page without a playback url", async () => {
    resetRxrinaRequestCache();
    const paths: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input));
      paths.push(`${url.pathname}?${url.searchParams.toString()}`);
      return responseFor(url, {
        "/server/movie/list": {
          code: 200,
          total: 30,
          rows: [
            {
              id: 10,
              title: "测试作品",
              duration: "65000",
              poster: "COVER_RES/a",
              columnValue: "push_1",
              movieVideos: [{ id: 99, videoId: 100 }],
            },
          ],
        },
      });
    };
    const page = await fetchRxrinaActorPage(RXRINA_SITE_ORIGIN, "push_1", 1, fetchImpl);
    assert.equal(page.videos[0]?.hls, "");
    assert.equal(page.hasNext, true);
    assert.equal(paths.some((path) => path.includes("columnValue=push_1")), true);
    assert.equal(paths.some((path) => path.includes("videoAuth")), false);
  });
});
