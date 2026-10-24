import { createFileRoute } from "@tanstack/react-router";

const handle = async ({ request }: { request: Request }) => {
  const { handleFilesRequest } = await import("@/lib/tx/files.server");
  return handleFilesRequest(request);
};

export const Route = createFileRoute("/api/files")({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
      DELETE: handle,
    },
  },
});
