import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/preview")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handlePreviewRequest } = await import("@/lib/tx/preview.server");
        return handlePreviewRequest(request);
      },
    },
  },
});
