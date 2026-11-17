// Sample data loading and first-visit seeding for the demo build.
// Pure: only touches the Store and StorageLike it is given.

import type { StorageLike } from "@/lib/data/browser-store";
import { addDays, format } from "date-fns";
import type { BaseDoc, Store } from "@/lib/data/store";
import type { LinkGroup } from "@/types/links/link-group";
import type { LinkItem } from "@/types/links/link";
import type { Listing, Tour } from "@/types/future/apartments";
import { SETTINGS_RECORD_KEY } from "@/lib/future/validators";
import { dispatch, unwrap } from "@/lib/data/dispatch";
import { accounts, categories, profiles, transactions } from "@/lib/finance/api/docs";
import { financeRoutes } from "@/lib/finance/api/routes";
import { financeSample } from "./finance";
import { futureSample } from "./future";
import { linksSample } from "./links";

export const SEEDED_KEY = "ts:data:seeded";

export async function loadSampleData(store: Store, today: Date = new Date()): Promise<void> {
  await loadLinks(store);
  await loadFuture(store, today);
  await loadFinance(store, today);
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
  await settings.insert({ key: SETTINGS_RECORD_KEY, ...sample.settings });
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

// Finance is created through its own handlers, with `today` as their clock, so balances and
// the applied Datasheet profile are exactly what the app would produce.
async function loadFinance(store: Store, today: Date): Promise<void> {
  await transactions(store).deleteMany({});
  await accounts(store).deleteMany({});
  await categories(store).deleteMany({});
  await profiles(store).deleteMany({});

  const request = async <T>(method: string, url: string, body?: unknown): Promise<T> => {
    const result = await dispatch(financeRoutes, store, method, url, body, today);
    if (result.status < 200 || result.status >= 300) {
      // Never continue with a half-built dataset.
      const sent = body as { name?: string; description?: string } | undefined;
      const what = sent?.name ?? sent?.description;
      throw new Error(
        `Loading the Finance sample failed at ${method} ${url}${what ? ` (${what})` : ""}: ` +
          `${result.status} ${JSON.stringify(result.body)}`,
      );
    }
    return unwrap<T>(result);
  };

  const sample = financeSample(today);
  await request("GET", "/api/categories"); // seeds the default categories and the Cash account

  const accountIds = new Map<string, string>();
  for (const { key, ...data } of sample.accounts) {
    const created = await request<{ _id: string }>("POST", "/api/accounts", data);
    accountIds.set(key, created._id);
  }
  const idOf = (key: string): string => {
    const id = accountIds.get(key);
    if (!id) throw new Error(`Loading the Finance sample failed: unknown sample account "${key}"`);
    return id;
  };

  const linked = new Map<string, string>();
  const ordered = [
    ...sample.transactions.filter((t) => !t.isRecurring),
    ...sample.transactions.filter((t) => t.isRecurring),
  ];
  for (const { key, account, toAccount, ...data } of ordered) {
    const created = await request<{ _id: string }>("POST", "/api/transactions", {
      ...data,
      accountId: idOf(account),
      ...(toAccount ? { toAccountId: idOf(toAccount) } : {}),
    });
    if (key) linked.set(key, created._id);
  }

  await request("PUT", "/api/finance-profile", {
    ...sample.profile,
    salaryTransactionId: linked.get("salary") ?? null,
    rentTransactionId: linked.get("rent") ?? null,
  });
}

export async function ensureDemoSeed(store: Store, storage: StorageLike): Promise<boolean> {
  if (storage.getItem(SEEDED_KEY) !== null) return false;
  // Claim the seed first so a second tab opening at the same moment does not also load it.
  storage.setItem(SEEDED_KEY, "1");
  try {
    await loadSampleData(store);
  } catch (error) {
    storage.removeItem(SEEDED_KEY);
    throw error;
  }
  return true;
}
