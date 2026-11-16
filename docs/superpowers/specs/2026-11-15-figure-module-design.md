# Figure module (fitness + diet) — v1

## Context
Tracker Suite gets a fourth module, **Figure**, covering fitness and diet. For v1 the user wants:
- **Fitness page** with tabs **Log** and **Workouts**. Workouts = reusable workout definitions. Log = for a given day, pick a workout (assigned at log time, no weekly schedule) and record what was actually done: sets with reps and weight.
- **Diet page** with tabs **Recipes** and **Shopping List**. Recipes have structured ingredients; one click adds a recipe's ingredients to the shopping list.

Out of scope for v1: calories/macros, body weight/measurements, charts/PRs, weekly auto-scheduling.

## Approach (my calls, correct if wrong)
- Follow the **Projects module pattern** exactly (simplest existing module): `src/models/figure/`, `src/types/figure/`, `src/lib/figure/validators.ts` (Zod), `src/hooks/figure/` (SWR + create/update/delete fns like `src/hooks/projects/use-tasks.ts`), `src/components/figure/`, API routes under `src/app/api/figure/...` with try/catch + `safeParse` → 400 / 500 like `src/app/api/projects/route.ts`.
- **Exercises are free-text names inside workouts/logs**, not a separate library. Autocomplete from names already used; "last time" lookup matches name case-insensitively. Avoids an extra CRUD screen; can be promoted to a collection later.
- Weight stored as a plain number in **lbs** (no unit toggle in v1).
- Logging a workout **snapshots** the template's exercises into the log, so later template edits don't rewrite history.
- Adding a recipe to the shopping list **merges** with an unchecked item of the same name+unit (sums qty); otherwise inserts. Items remember `recipeId` for a "from: Recipe" label.
- Tabs use the existing `src/components/ui/tabs.tsx` (as in `src/app/(app)/finance/projections/page.tsx`), tab state in `?tab=` query param.

## Data models (`src/models/figure/`, Mongoose, same hot-reload delete pattern as `Project.ts`)
- **Workout**: `name`, `notes?`, `exercises: [{ name, targetSets, targetReps, targetWeight? , notes? }]`, `order`, timestamps.
- **WorkoutLog**: `date` (Date, day-level), `workoutId?` (ref Workout), `name` (snapshot), `exercises: [{ name, sets: [{ reps, weight, done }] }]`, `notes?`, timestamps. Index `{ date: -1 }`, `{ "exercises.name": 1 }`.
- **Recipe**: `name`, `servings?`, `ingredients: [{ name, quantity?, unit? }]`, `instructions` (markdown string, rendered with existing `react-markdown`), `tags: string[]`, timestamps.
- **ShoppingItem**: `name`, `quantity?`, `unit?`, `checked`, `recipeId?`, `order`, timestamps.

## API routes (`src/app/api/figure/`)
- `workouts` GET/POST, `workouts/[workoutId]` GET/PUT/DELETE
- `workout-logs` GET (`?startDate&endDate`, `?date`), POST; `workout-logs/[logId]` GET/PUT/DELETE
- `exercises/history` GET `?name=` → most recent logged sets for that exercise (for "last time"); `exercises/names` GET → distinct names for autocomplete
- `recipes` GET/POST, `recipes/[recipeId]` GET/PUT/DELETE, `recipes/[recipeId]/add-to-list` POST (merge logic above)
- `shopping-items` GET/POST, `shopping-items/[itemId]` PUT/DELETE, `shopping-items/clear-checked` POST

## Pages & UI
- `src/lib/modules.ts`: add module `{ id: "figure", label: "Figure", icon: Dumbbell, basePath: "/figure", accentColor: "var(--chart-5)", navItems: [Fitness /figure/fitness, Diet /figure/diet] }`. Check `src/lib/icon-map.ts` and the sidebar for anything needing a new icon entry.
- `src/app/(app)/figure/page.tsx`: redirect to `/figure/fitness`.
- `src/app/(app)/figure/fitness/page.tsx` — tabs:
  - **Log**: date picker (existing `calendar` + `popover`), list of logs for that day + recent logs. "Log workout" → pick a workout (or blank) → editor prefilled with target sets/reps/weight; each exercise row shows "last time: 3×8 @ 185"; edit reps/weight per set, add/remove sets/exercises, save.
  - **Workouts**: cards of workout definitions; create/edit in a Dialog form (name, exercises with target sets/reps/weight).
- `src/app/(app)/figure/diet/page.tsx` — tabs:
  - **Recipes**: card list with tag filter; Dialog form (name, servings, ingredient rows, instructions, tags); detail view with "Add to shopping list".
  - **Shopping List**: quick-add input, checkbox list (unchecked first), source recipe label, "Clear checked".
- Components in `src/components/figure/`: `workout-form.tsx`, `workout-card.tsx`, `workout-log-editor.tsx`, `workout-log-card.tsx`, `recipe-form.tsx`, `recipe-card.tsx`, `shopping-list.tsx`. Reuse `page-header.tsx`, `empty-state.tsx`, `loading-state.tsx`, `delete-confirm-dialog.tsx`, sonner toasts.
- Global dashboard `src/app/(app)/page.tsx`: add a small Figure card (last workout + unchecked shopping item count) in the `moduleId` switch.

## Steps
1. Write design doc `docs/superpowers/specs/2026-11-15-figure-module-design.md` (this content).
2. Types + Zod validators + models.
3. API routes (workouts, logs, exercise history/names, recipes, add-to-list, shopping items).
4. SWR hooks.
5. Module registration + Fitness page (Workouts tab, then Log tab).
6. Diet page (Recipes, Shopping List).
7. Dashboard card, `npm run lint`, `npm run build`.

## Verification
- `npm run lint` and `npm run build` clean.
- `npm run dev` (port 3030) and drive in the browser pane: create a workout → log it for today with modified reps/weight → log again and confirm "last time" shows prior numbers → edit template and confirm old log unchanged. Create a recipe → add to list twice → quantities merge → check items → clear checked. Sidebar shows Figure with both nav items; dashboard card renders.
