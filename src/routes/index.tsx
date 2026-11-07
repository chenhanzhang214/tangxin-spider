import { createFileRoute } from "@tanstack/react-router";
import { getActors, getHome, getSiteOrigin, getTags } from "@/lib/tx/fns";
import { SITE_ORIGIN, type NamedCount } from "@/lib/tx/types";
import { Home } from "@/features/workspace/workspace";
import { friendlyLoadError } from "@/features/workspace/helpers";

export const Route = createFileRoute("/")({
  loader: async () => {
    try {
      const [home, actors, tags, origin] = await Promise.all([
        getHome({ data: {} }),
        getActors({ data: {} }),
        getTags({ data: {} }),
        getSiteOrigin(),
      ]);
      return { home, actors, tags, origin, error: null as string | null };
    } catch (err) {
      return {
        home: null,
        actors: [] as NamedCount[],
        tags: [] as NamedCount[],
        origin: SITE_ORIGIN,
        error: friendlyLoadError(err),
      };
    }
  },
  component: WorkspaceRoute,
});

function WorkspaceRoute() {
  return <Home data={Route.useLoaderData()} />;
}
