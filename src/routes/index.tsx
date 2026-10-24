import { createFileRoute } from "@tanstack/react-router";
import { getActors, getHome, getTags } from "@/lib/tx/fns";
import { type NamedCount } from "@/lib/tx/types";
import { Home } from "@/features/workspace/workspace";
import { friendlyLoadError } from "@/features/workspace/helpers";

export const Route = createFileRoute("/")({
  loader: async () => {
    try {
      const [home, actors, tags] = await Promise.all([getHome(), getActors(), getTags()]);
      return { home, actors, tags, error: null as string | null };
    } catch (err) {
      return {
        home: null,
        actors: [] as NamedCount[],
        tags: [] as NamedCount[],
        error: friendlyLoadError(err),
      };
    }
  },
  component: WorkspaceRoute,
});

function WorkspaceRoute() {
  return <Home data={Route.useLoaderData()} />;
}
