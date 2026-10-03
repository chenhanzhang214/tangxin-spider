#!/usr/bin/env node

import { accessSync, constants, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const projectPath = join(root, "ios", "TangxinApp.xcodeproj");
const outputRoot = join(root, "release", "ios");
const mode = process.argv.includes("--package") ? "package" : "simulator";

function fail(message) {
  console.error(`[ios] ${message}`);
  process.exit(1);
}

function requireFile(path, label) {
  try {
    accessSync(path, constants.F_OK);
  } catch {
    fail(`找不到 ${label}：${path}`);
  }
}

function runXcodebuild(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("xcodebuild", args, {
      cwd: root,
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`xcodebuild 被信号 ${signal} 终止`));
      else if (code !== 0) reject(new Error(`xcodebuild 退出码 ${code}`));
      else resolvePromise();
    });
  });
}

function webAppURL() {
  const value = process.env.IOS_WEB_APP_URL?.trim();
  if (!value || !/^https:\/\//i.test(value)) {
    fail(
      "IOS_WEB_APP_URL 必须是已部署 Web 应用的 HTTPS 地址。" +
        " 例如：IOS_WEB_APP_URL=https://your-app.example.com npm run ios:package",
    );
  }
  return value;
}

function exportOptions(method) {
  const team = process.env.IOS_DEVELOPMENT_TEAM?.trim();
  const teamLine = team ? `\n\t<key>teamID</key>\n\t<string>${escapeXml(team)}</string>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>method</key>
\t<string>${escapeXml(method)}</string>
\t<key>signingStyle</key>
\t<string>automatic</string>
\t<key>destination</key>
\t<string>export</string>
\t<key>compileBitcode</key>
\t<false/>
\t<key>stripSwiftSymbols</key>
\t<true/>${teamLine}
</dict>
</plist>
`;
}

function escapeXml(value) {
  return value.replace(/[<>&'"]/g, (character) => {
    switch (character) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      default:
        return "&quot;";
    }
  });
}

async function main() {
  requireFile(projectPath, "Xcode 工程");
  if (process.platform !== "darwin") {
    fail("iOS 安装包必须在 macOS + Xcode 上签名构建；当前 Windows 环境只能准备工程文件。");
  }

  mkdirSync(outputRoot, { recursive: true });
  const url = mode === "package" ? webAppURL() : process.env.IOS_WEB_APP_URL?.trim() || "http://127.0.0.1:8080";
  const common = [
    "-project",
    projectPath,
    "-scheme",
    "TangxinApp",
    "-derivedDataPath",
    join(outputRoot, "DerivedData"),
    `IOS_WEB_APP_URL=${url}`,
  ];

  try {
    if (mode === "simulator") {
      await runXcodebuild([
        ...common,
        "-configuration",
        "Debug",
        "-sdk",
        "iphonesimulator",
        "-destination",
        "generic/platform=iOS Simulator",
        "CODE_SIGNING_ALLOWED=NO",
        "build",
      ]);
      console.log(`[ios] 模拟器构建完成：${join(outputRoot, "DerivedData/Build/Products/Debug-iphonesimulator/TangxinApp.app")}`);
      return;
    }

    const archivePath = join(outputRoot, "TangxinApp.xcarchive");
    const exportPath = join(outputRoot, "export");
    const exportOptionsPath = join(outputRoot, "ExportOptions.plist");
    const archiveArgs = [
      ...common,
      "-configuration",
      "Release",
      "-destination",
      "generic/platform=iOS",
      "-archivePath",
      archivePath,
      ...(process.env.IOS_ALLOW_PROVISIONING_UPDATES === "1" ? ["-allowProvisioningUpdates"] : []),
      "archive",
    ];
    await runXcodebuild(archiveArgs);
    const method = process.env.IOS_EXPORT_METHOD?.trim() || "ad-hoc";
    writeFileSync(exportOptionsPath, exportOptions(method), "utf8");
    await runXcodebuild([
      "-exportArchive",
      "-archivePath",
      archivePath,
      "-exportOptionsPlist",
      exportOptionsPath,
      "-exportPath",
      exportPath,
    ]);
    console.log(`[ios] 安装包已导出到：${exportPath}`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

main();
