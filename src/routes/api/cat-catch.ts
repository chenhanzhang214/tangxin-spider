import { createFileRoute } from "@tanstack/react-router";

const handle = async ({ request }: { request: Request }) => {
  const { handleCatCatchRequest } = await import("@/lib/tx/cat-catch.server");
  return handleCatCatchRequest(request);
};

export const Route = createFileRoute("/api/cat-catch")({
  server: { handlers: { GET: handle, POST: handle } },
});
