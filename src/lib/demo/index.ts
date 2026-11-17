// Sample data loading and first-visit seeding for the demo build.
// Pure: only touches the Store and StorageLike it is given.

import type { StorageLike } from "@/lib/data/browser-store";
import { addDays, format } from "date-fns";
import type { BaseDoc, Store } from "@/lib/data/store";
import type { LinkGroup } from "@/types/links/link-group";
import type { LinkItem } from "@/types/links/link";
import type { Listing, Tour } from "@/types/future/apartments";
import { SETTINGS_KEY } from "@/lib/future/validators";
import { futureSample } from "./future";
import { linksSample } from "./links";

export const SEEDED_KEY = "ts:data:seeded";

export async function loadSampleData(store: Store, today: Date = new Date()): Promise<void> {
  await loadLinks(store);
  await loadFuture(store, today);
}

async function loadLinks(store: Store): Promise<void> {
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

async function loadFuture(store: Store, today: Date): Promise<void> {
  const listings = store.collection<Listing>("listings");
  const tours = store.collection<Tour>("tours");
  const settings = store.collection<BaseDoc & { key: string }>("futureSettings");
  await tours.deleteMany({});
  await listings.deleteMany({});
  await settings.deleteMany({});

  const sample = futureSample(today);
  await settings.insert({ key: SETTINGS_KEY, ...sample.settings });
  for (const { tours: sampleTours, ...data } of sample.listings) {
    const listing = await listings.insert(data);
    await tours.insertMany(
      sampleTours.map((t) => ({
        listingId: listing._id,
        date: format(addDays(today, t.daysFromToday), "yyyy-MM-dd"),
        time: t.time,
        notes: t.notes,
      }))
    );
  }
}

export async function ensureDemoSeed(store: Store, storage: StorageLike): Promise<boolean> {
  if (storage.getItem(SEEDED_KEY) !== null) return false;
  await loadSampleData(store);
  storage.setItem(SEEDED_KEY, "1");
  return true;
}
