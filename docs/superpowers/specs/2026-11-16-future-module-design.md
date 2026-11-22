# Future module (apartment listing tracker) — v1

## Context
Tracker Suite gets a **Future** module for an apartment search that will run a few months: collect listings, group them by city, compare them on price, and plan tours.

- Goals: record a listing in under a minute; see at a glance which listings and cities are cheapest; line a shortlist up side by side; keep tour dates and notes.
- Non-goals for v1: deposit / fee / utilities fields and a true-monthly-cost figure; maps or commute lookup; importing listings from a URL; photos.
- Anti-goal: coupling to Finance. Future imports nothing from `finance/` and reads no finance data. Affordability uses a salary typed into Future; a Finance tie-in can come later.

## Approaches considered
1. **Sub-tabs in Listings (chosen).** Top tabs Dashboard | Listings | Compare | Tours; inside Listings a second row of city tabs built from the listings' cities, plus All. Keeps the top row free for other sections.
2. City per top-level tab. Simpler, but the row crowds as cities and sections grow.
3. One table with a city dropdown. Most compact, but two clicks to switch city.

## Decisions
User's:
- Layout 1 above. Extra tabs: Compare and Tours.
- Listing fields: city, price, link, plus basics + status, amenities, commute + contact.
- Salary entry box inside Future for affordability; modules stay separate.

Builder's calls:
- One sidebar entry, **Apartments** (`/future/apartments`); `/future` redirects to it, leaving room for other Future sections.
- City tabs match case-insensitively and trimmed; the first-seen spelling is displayed. The form suggests existing cities.
- Stats are pure functions over the listings list, computed in the browser (`src/lib/future/stats.ts`, tested). No stats API.
- Rejected listings stay in the Listings table but are left out of dashboard figures, except the status chart.
- Affordability = monthly rent ÷ (annual salary ÷ 12), gross. A 30% guide line is drawn on the rent chart. Nothing affordability-related shows until a salary is saved.
- Deleting a listing deletes its tours. Tours never change a listing's status.
- Listing PUT is a full replace (omitted optional fields are cleared); PATCH changes status only.
- Generic helpers moved out of Figure for sharing: `src/hooks/use-tab-param.ts`, `src/hooks/request.ts`, `src/lib/api-helpers.ts`, `src/components/stat-tile.tsx`, `src/components/chart-card.tsx`.

## Data (`src/models/future/`)
- **Listing**: required `name`, `city`, `rent` (cents); `status` (`saved | contacted | toured | applied | rejected | signed`, default `saved`); `amenities` (`laundry | parking | pets | ac | dishwasher | outdoor`); optional `url`, `address`, `neighborhood`, `beds` (0 = studio), `baths`, `sqft`, `availableDate` (`yyyy-MM-dd`), `leaseMonths`, `rating` (1–5), `notes`, `commuteMinutes`, `contactName`, `contactPhone`, `contactEmail`. Index `{ city: 1, rent: 1 }`.
- **Tour**: `listingId`, `date` (`yyyy-MM-dd`), `time?` (`HH:mm`), `notes?`. Index `{ date: 1 }`.
- **FutureSettings**: one document (`key: "default"`); `annualSalary?` (cents), `commuteDestination?`.

## API (`src/app/api/future/`)
- `listings` GET (`city`, `status` filters), POST; `listings/[listingId]` PUT, PATCH, DELETE (cascades to tours)
- `tours` GET, POST; `tours/[tourId]` PUT, DELETE. POST/PUT reject an unknown listing with 400.
- `settings` GET, PUT (upsert, full replace)

## UI (`src/app/(app)/future/apartments/page.tsx`, `src/components/future/`)
- **Dashboard**: stat tiles (active listings, average rent, lowest rent, within-30% count or next tour), affordability card (salary, commute destination), charts: rent by listing, average rent by city, listings by status, price per sq ft.
- **Listings**: city sub-tabs (`?city=`), table sortable by rent, inline status change, row menu Edit / Schedule tour / Delete.
- **Compare**: up to 4 listings (`?compare=id,id`), best value per row highlighted (lowest rent, $/sq ft, commute; highest size, beds, baths, rating).
- **Tours**: Upcoming and Past groups.
- Global dashboard card: average rent, active count, next tour.

## Verification
`npm test`, `npm run lint` (no new findings), `npm run build`, then a browser pass over each tab.
