import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyResponse, isTangxinDocument } from "./windows-start.mjs";

const tangxinHtml =
  '<!doctype html><html><head><title>糖心图谱</title></head>' +
  '<body>tangxinvlog.app</body></html>';

test("recognizes the Tangxin page instead of any arbitrary HTTP response", () => {
  assert.equal(isTangxinDocument(tangxinHtml), true);
  assert.equal(isTangxinDocument("<title>llama-ui</title>"), false);
  assert.equal(isTangxinDocument("<title>糖心图谱</title>"), false);
});

test("classifies the expected app as ready", () => {
  assert.deepEqual(classifyResponse(200, tangxinHtml), { kind: "ready" });
});

test("classifies another app on port 8080 as an occupied-port error", () => {
  const result = classifyResponse(200, "<title>llama-ui</title>");
  assert.equal(result.kind, "occupied");
  assert.match(result.message, /8080/);
  assert.match(result.message, /糖心图谱/);
});

test("classifies a failed request as not ready", () => {
  assert.deepEqual(classifyResponse(0, ""), {
    kind: "not-ready",
    message: "服务尚未响应 http://localhost:8080/。",
  });
});
