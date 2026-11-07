import { getActors, getHome, getTags } from "./fns";

export async function loadSiteCatalog(origin: string) {
  const data = { origin };
  const [home, actors, tags] = await Promise.all([
    getHome({ data }),
    getActors({ data }),
    getTags({ data }),
  ]);
  return { home, actors, tags };
}
