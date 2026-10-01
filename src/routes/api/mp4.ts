import { createFileRoute } from "@tanstack/react-router";

const handle = async ({ request }: { request: Request }) => {
  const { handleMp4Request } = await import("@/lib/tx/mp4.server");
  return handleMp4Request(request);
};

export const Route = createFileRoute("/api/mp4")({
  server: { handlers: { GET: handle } },
});
