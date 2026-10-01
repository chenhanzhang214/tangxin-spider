import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_DOWNLOAD_DIRECTORY,
  isValidDownloadDirectory,
  normalizeDownloadDirectory,
  parseStoredDownloadDirectory,
} from "./download-settings.ts";

describe("download settings", () => {
  it("accepts absolute Windows and POSIX directories", () => {
    assert.equal(isValidDownloadDirectory("E:\\TangxinData"), true);
    assert.equal(isValidDownloadDirectory("C:/Videos"), true);
    assert.equal(isValidDownloadDirectory("/mnt/videos"), true);
  });

  it("rejects relative, empty, and unsafe directory values", () => {
    assert.equal(isValidDownloadDirectory("downloads/spider"), false);
    assert.equal(isValidDownloadDirectory("   "), false);
    assert.equal(isValidDownloadDirectory("E:\\videos\0"), false);
    assert.equal(isValidDownloadDirectory("x".repeat(513)), false);
  });

  it("trims values and falls back when stored settings are invalid", () => {
    assert.equal(normalizeDownloadDirectory("  E:\\videos  "), "E:\\videos");
    assert.equal(parseStoredDownloadDirectory("  E:\\videos  "), "E:\\videos");
    assert.equal(parseStoredDownloadDirectory("relative/path"), DEFAULT_DOWNLOAD_DIRECTORY);
    assert.equal(parseStoredDownloadDirectory(null), DEFAULT_DOWNLOAD_DIRECTORY);
  });
});
