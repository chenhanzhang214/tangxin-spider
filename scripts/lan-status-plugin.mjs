import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

export function projectIdentity(root) {
  const canonical = realpathSync(root);
  return createHash("sha256")
    .update(process.platform === "win32" ? canonical.toLowerCase() : canonical)
    .digest("hex");
}

export function lanStatusPlugin() {
  return {
    name: "tangxin:lan-status",
    apply: "serve",
    configureServer(server) {
      const info = {
        app: "tangxin",
        version: JSON.parse(readFileSync(join(server.config.root, "package.json"), "utf8")).version,
        projectId: projectIdentity(server.config.root),
        managed: process.env.TX_LAN_MANAGED === "1",
        lan: server.config.server.host === "0.0.0.0" || server.config.server.host === true,
      };
      server.middlewares.use((request, response, next) => {
        if (request.method !== "GET" || request.url !== "/__tangxin/server-info") return next();
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.end(JSON.stringify(info));
      });
    },
  };
}
