// Sample data loading and first-visit seeding for the demo build.
// Pure: only touches the Store and StorageLike it is given.

import type { StorageLike } from "@/lib/data/browser-store";
import type { Store } from "@/lib/data/store";
import type { LinkGroup } from "@/types/links/link-group";
import type { LinkItem } from "@/types/links/link";
import { linksSample } from "./links";

export const SEEDED_KEY = "ts:data:seeded";

export async function loadSampleData(store: Store): Promise<void> {
  const groups = store.collection<LinkGroup>("linkGroups");
  const links = store.collection<LinkItem>("links");
  await links.deleteMany({});
  await groups.deleteMany({});

  const sample = linksSample();
  for (const [order, group] of sample.groups.entries()) {
    const created = await groups.insert({
      name: group.name,
      slug: group.slug,
      icon: group.icon,
      order,
    });
    await links.insertMany(
      group.links.map((link, i) => ({ groupId: created._id, name: link.name, url: link.url, order: i }))
    );
  }
}

export async function ensureDemoSeed(store: Store, storage: StorageLike): Promise<boolean> {
  if (storage.getItem(SEEDED_KEY) !== null) return false;
  storage.setItem(SEEDED_KEY, "1");
  await loadSampleData(store);
  return true;
}
