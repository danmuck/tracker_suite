// Links API logic as store-backed handlers, shared by the server and browser data modes.
// Pure: no framework, browser or server imports.

import { fail, invalid, isId, notFound, ok, type Handler } from "@/lib/data/api";
import type { Collection, Store } from "@/lib/data/store";
import { linkGroupSchema, linkSchema } from "@/lib/links/validators";
import type { LinkItem } from "@/types/links/link";
import type { LinkGroup } from "@/types/links/link-group";

const GROUP_NOT_FOUND = "Group";
const LINK_NOT_FOUND = "Link";
const BY_ORDER = { order: 1, createdAt: -1 } as const;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

const groups = (store: Store): Collection<LinkGroup> =>
  store.collection<LinkGroup>("linkGroups");
const links = (store: Store): Collection<LinkItem> =>
  store.collection<LinkItem>("links");

async function nextOrder<T extends { order: number; _id: string; createdAt: string; updatedAt: string }>(
  collection: Collection<T>,
  filter: Record<string, unknown> = {},
): Promise<number> {
  const top = await collection.findOne(filter, { sort: { order: -1 }, select: ["order"] });
  return (top?.order ?? -1) + 1;
}

export const listGroups: Handler = async ({ store }) => {
  const found = await groups(store).find({}, { sort: BY_ORDER });
  const ids = found.map((g) => g._id);
  const linked = await links(store).find({ groupId: { $in: ids } }, { select: ["groupId"] });
  const counts = new Map<string, number>();
  for (const link of linked) counts.set(link.groupId, (counts.get(link.groupId) ?? 0) + 1);
  return ok(found.map((g) => ({ ...g, linkCount: counts.get(g._id) ?? 0 })));
};

export const createGroup: Handler = async ({ store, body }) => {
  const parsed = linkGroupSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  const { name, icon } = parsed.data;
  let slug = slugify(name);
  if (await groups(store).exists({ slug })) slug = `${slug}-${Date.now()}`;

  const order = await nextOrder(groups(store));
  const group = await groups(store).insert({ name, slug, icon, order });
  return ok(group, 201);
};

export const getGroup: Handler = async ({ store, params }) => {
  const group = isId(params.groupId) ? await groups(store).findById(params.groupId) : null;
  return group ? ok(group) : notFound(GROUP_NOT_FOUND);
};

export const updateGroup: Handler = async ({ store, params, body }) => {
  const existing = isId(params.groupId) ? await groups(store).findById(params.groupId) : null;
  if (!existing) return notFound(GROUP_NOT_FOUND);

  const parsed = linkGroupSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  const { name, icon } = parsed.data;
  let slug = existing.slug;
  if (name !== existing.name) {
    slug = slugify(name);
    if (await groups(store).exists({ slug, _id: { $ne: existing._id } })) slug = `${slug}-${Date.now()}`;
  }

  const set: Record<string, unknown> = { name, slug };
  if (icon !== undefined) set.icon = icon;
  const updated = await groups(store).updateById(existing._id, { $set: set });
  return updated ? ok(updated) : notFound(GROUP_NOT_FOUND);
};

export const deleteGroup: Handler = async ({ store, params }) => {
  const group = isId(params.groupId) ? await groups(store).findById(params.groupId) : null;
  if (!group) return notFound(GROUP_NOT_FOUND);

  await links(store).deleteMany({ groupId: group._id });
  await groups(store).deleteById(group._id);
  return ok({ message: "Group and associated links deleted" });
};

export const listLinks: Handler = async ({ store, query }) => {
  const groupId = query.get("groupId");
  const found = await links(store).find(groupId ? { groupId } : {}, { sort: BY_ORDER });
  return ok(found);
};

export const createLink: Handler = async ({ store, body }) => {
  const parsed = linkSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  const { groupId, name, url } = parsed.data;
  const group = isId(groupId) ? await groups(store).findById(groupId) : null;
  if (!group) return fail(404, "Link group not found");

  const order = await nextOrder(links(store), { groupId: group._id });
  const link = await links(store).insert({ groupId: group._id, name, url, order });
  return ok(link, 201);
};

export const getLink: Handler = async ({ store, params }) => {
  const link = isId(params.linkId) ? await links(store).findById(params.linkId) : null;
  return link ? ok(link) : notFound(LINK_NOT_FOUND);
};

export const updateLink: Handler = async ({ store, params, body }) => {
  const existing = isId(params.linkId) ? await links(store).findById(params.linkId) : null;
  if (!existing) return notFound(LINK_NOT_FOUND);

  const parsed = linkSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  const updated = await links(store).updateById(existing._id, {
    $set: { name: parsed.data.name, url: parsed.data.url },
  });
  return updated ? ok(updated) : notFound(LINK_NOT_FOUND);
};

export const deleteLink: Handler = async ({ store, params }) => {
  const link = isId(params.linkId) ? await links(store).findById(params.linkId) : null;
  if (!link) return notFound(LINK_NOT_FOUND);

  await links(store).deleteById(link._id);
  return ok({ message: "Link deleted" });
};
