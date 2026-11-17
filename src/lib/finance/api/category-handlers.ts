// Category routes (R16–R17) as store-backed handlers, shared by the server and browser data modes.
// Same reads and writes as src/app/api/categories/route.ts.
// Pure: no framework, browser or server imports (browser-reachable).

import { fail, ok, type Handler } from "@/lib/data/api";
import { ConflictError } from "@/lib/data/store";
import { DEFAULT_CATEGORIES } from "@/lib/finance/constants";
import { categorySchema, type CategoryInput } from "@/lib/finance/validators";
import { categories, shapeCategory } from "./docs";

/** GET /api/categories — seed the defaults into an empty collection, then list defaults first, by name. */
export const listCategories: Handler = async ({ store }) => {
  const cat = categories(store);
  if ((await cat.count()) === 0) {
    try {
      await cat.insertMany(DEFAULT_CATEGORIES.map((c) => ({ ...c }))); // C1, C2
    } catch (error) {
      // An overlapping first request seeded them first (bug 16): read what it wrote. On MongoDB
      // create() settles every insert before it rejects, so the read sees the whole seed.
      if (!(error instanceof ConflictError)) throw error;
    }
  }
  const list = await cat.find({}, { sort: { isDefault: -1, name: 1 } }); // C3
  return ok({ data: list.map(shapeCategory) });
};

/** POST /api/categories — the name is matched and stored trimmed and lowercased (the schema's setters). */
export const createCategory: Handler = async ({ store, body }) => {
  let validated: CategoryInput;
  try {
    validated = categorySchema.parse(body);
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return fail(400, "Validation failed", JSON.parse(JSON.stringify(error)));
    }
    throw error;
  }

  // Mongoose applies trim and lowercase to the query value and the stored value; a name that
  // trims to "" fails the schema's required check (the route's 500).
  const name = validated.name.trim().toLowerCase();
  if (name === "") throw new Error("name is required");

  const cat = categories(store);
  if (await cat.findOne({ name })) return fail(400, "Category already exists"); // C4

  const category = await cat.insert({ name, color: validated.color, icon: validated.icon, isDefault: validated.isDefault }); // C5
  return ok({ data: shapeCategory(category) }, 201);
};
