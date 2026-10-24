import { createServer, request as httpRequest } from "node:http";
import { networkInterfaces } from "node:os";

export function localIpv4Addresses() {
  return [
    ...new Set(
      Object.values(networkInterfaces())
        .flat()
        .filter((entry) => entry && entry.family === "IPv4" && !entry.internal)
        .map((entry) => entry.address),
    ),
  ];
}

function proxyHeaders(headers) {
  const clean = { ...headers };
  const nominated = String(clean.connection ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase());
  for (const key of [
    ...nominated,
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "proxy-connection",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "forwarded",
    "x-forwarded-host",
    "x-forwarded-proto",
    "x-forwarded-port",
  ])
    delete clean[key];
  return clean;
}

export async function openLanGateway(targetUrl, preferredPort) {
  const target = new URL(targetUrl);
  if (
    target.protocol !== "http:" ||
    target.hostname !== "127.0.0.1" ||
    target.username ||
    target.password
  )
    throw new Error("局域网服务只能连接本机后台。");
  const preferred =
    Number.isInteger(preferredPort) && preferredPort >= 0 && preferredPort <= 65535
      ? preferredPort
      : 8081;
  const candidates =
    preferred === 0
      ? [0]
      : [
          ...new Set(
            Array.from({ length: 24 }, (_, offset) =>
              preferred + offset <= 65535 ? preferred + offset : 8081 + offset,
            ),
          ),
        ].filter((port) => port !== Number(target.port));
  for (const port of candidates) {
    const server = createServer((incoming, outgoing) => {
      let host;
      try {
        host = new URL(`http://${incoming.headers.host}`);
      } catch {
        outgoing.writeHead(400).end();
        return;
      }
      if (
        !["localhost", "127.0.0.1", ...localIpv4Addresses()].includes(host.hostname) ||
        Number(host.port || 80) !== server.address().port ||
        !incoming.url?.startsWith("/") ||
        incoming.url.startsWith("//")
      ) {
        outgoing.writeHead(403).end();
        return;
      }
      const upstream = httpRequest(
        {
          hostname: target.hostname,
          port: target.port || 80,
          method: incoming.method,
          path: incoming.url,
          headers: proxyHeaders(incoming.headers),
        },
        (response) => {
          outgoing.writeHead(response.statusCode ?? 502, proxyHeaders(response.headers));
          response.on("error", () => outgoing.destroy());
          response.pipe(outgoing);
        },
      );
      upstream.on("error", () => {
        if (!outgoing.headersSent)
          outgoing
            .writeHead(502, { "Content-Type": "text/plain; charset=utf-8" })
            .end("本机服务暂时不可用，请稍后重试。");
        else outgoing.destroy();
      });
      incoming.on("error", () => upstream.destroy());
      outgoing.on("close", () => {
        if (!outgoing.writableFinished) upstream.destroy();
      });
      incoming.pipe(upstream);
    });
    server.on("clientError", (_error, socket) =>
      socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"),
    );
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen({ host: "0.0.0.0", port, exclusive: true }, () => {
          server.removeListener("error", reject);
          resolve();
        });
      });
    } catch (error) {
      if (error.code === "EADDRINUSE" || error.code === "EACCES") continue;
      throw error;
    }
    server.on("error", (error) => console.error(`[lan] ${error.message}`));
    return {
      port: server.address().port,
      close: () =>
        new Promise((resolve) => {
          server.close(resolve);
          server.closeAllConnections();
        }),
    };
  }
  throw new Error("局域网服务没有可用端口，请检查端口占用或网络权限。");
}
