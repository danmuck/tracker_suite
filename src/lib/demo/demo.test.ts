import test from "node:test";
import assert from "node:assert/strict";
import { BrowserStore } from "@/lib/data/browser-store";
import { memoryStorage } from "@/lib/data/test-helpers";
import { availableModules, modules } from "@/lib/modules";
import type { LinkGroup } from "@/types/links/link-group";
import type { LinkItem } from "@/types/links/link";
import type { Listing, Tour } from "@/types/future/apartments";
import { listingSchema } from "@/lib/future/validators";
import { ensureDemoSeed, loadSampleData, SEEDED_KEY } from "./index";
import { futureSample } from "./future";
import { linksSample } from "./links";

test("loadSampleData fills groups and links, and running it twice does not duplicate", async () => {
  const store = new BrowserStore(memoryStorage());
  await loadSampleData(store);
  await loadSampleData(store);
  const groups = await store.collection<LinkGroup>("linkGroups").find({}, { sort: { order: 1 } });
  const links = await store.collection<LinkItem>("links").find();
  const sample = linksSample();
  assert.equal(groups.length, sample.groups.length);
  assert.equal(links.length, sample.groups.reduce((n, g) => n + g.links.length, 0));
  assert.deepEqual(groups.map((g) => g.order), groups.map((_, i) => i));
  assert.ok(links.every((l) => groups.some((g) => g._id === l.groupId)));
  assert.ok(links.every((l) => l.url.startsWith("https://")));
});

test("ensureDemoSeed seeds once", async () => {
  const storage = memoryStorage();
  const store = new BrowserStore(storage);
  assert.equal(await ensureDemoSeed(store, storage), true);
  assert.equal(await ensureDemoSeed(store, storage), false);
  await store.collection<LinkGroup>("linkGroups").deleteMany({});
  assert.equal(await ensureDemoSeed(store, storage), false);
});

test("ensureDemoSeed leaves the key unset when loading fails, and a later call seeds", async () => {
  const storage = memoryStorage();
  const store = new BrowserStore(storage);
  storage.failWrites = true;
  await assert.rejects(ensureDemoSeed(store, storage));
  assert.equal(storage.getItem(SEEDED_KEY), null);
  storage.failWrites = false;
  assert.equal(await ensureDemoSeed(store, storage), true);
  assert.equal(storage.getItem(SEEDED_KEY), "1");
  assert.ok((await store.collection<LinkGroup>("linkGroups").find()).length > 0);
});

test("after a reset (store.clear) the demo seeds again", async () => {
  const storage = memoryStorage();
  const store = new BrowserStore(storage);
  assert.equal(await ensureDemoSeed(store, storage), true);
  store.clear();
  assert.equal(await ensureDemoSeed(store, storage), true);
});

test("availableModules hides modules without browser data in browser mode", () => {
  assert.deepEqual(availableModules("browser").map((m) => m.id), ["future", "links"]);
  assert.equal(availableModules("server").length, modules.length);
});

test("loadSampleData fills the Future module relative to today, and twice does not duplicate", async () => {
  const store = new BrowserStore(memoryStorage());
  const today = new Date(2026, 10, 17);
  await loadSampleData(store, today);
  await loadSampleData(store, today);
  const listings = await store.collection<Listing>("listings").find();
  const tours = await store.collection<Tour>("tours").find({}, { sort: { date: 1 } });
  const sample = futureSample(today);
  assert.equal(listings.length, sample.listings.length);
  assert.equal(tours.length, sample.listings.reduce((n, l) => n + l.tours.length, 0));
  assert.ok(tours.every((t) => listings.some((l) => l._id === t.listingId)));
  assert.ok(tours[0].date < "2026-11-17" && tours[tours.length - 1].date > "2026-11-17");
  assert.ok(listings.every((l) => l.rent >= 140000 && l.rent <= 320000));
  assert.ok(listings.some((l) => l.status === "rejected") && listings.some((l) => l.status === "toured"));
  assert.equal(await store.collection("futureSettings").count(), 1);
  assert.ok(new Set(listings.map((l) => l.city)).size === 3);
});

test("sample listings pass the module's own validation", () => {
  for (const { tours, ...data } of futureSample(new Date(2026, 10, 17)).listings) {
    assert.equal(listingSchema.safeParse(data).success, true, data.name);
    assert.ok(Array.isArray(tours));
  }
});
