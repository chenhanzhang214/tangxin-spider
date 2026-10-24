import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeRouteManifest } from "./sanitize-build-paths.mjs";

test("route metadata hides Windows and Unix checkout directories", () => {
  for (const root of ["C:/Users/Example/My Project", "/home/example/project"]) {
    const original = `filePath: "${root}/src/routes/__root.tsx"`;
    assert.equal(sanitizeRouteManifest(original), 'filePath: "src/routes/__root.tsx"');
  }
});

test("sanitizing metadata preserves relative paths and executable imports", () => {
  const text = 'filePath: "src/routes/api/files.ts"; import x from "/runtime/server.mjs";';
  assert.equal(sanitizeRouteManifest(text), text);
});
