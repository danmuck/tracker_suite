import { test } from "node:test";
import assert from "node:assert/strict";
import { BrowserStore } from "@/lib/data/browser-store";
import { dispatch } from "@/lib/data/dispatch";
import { memoryStorage } from "@/lib/data/test-helpers";
import type { Listing, Tour } from "@/types/future/apartments";
import { futureRoutes } from "./routes";

let store = new BrowserStore(memoryStorage());
const call = (method: string, url: string, body?: unknown) => dispatch(futureRoutes, store, method, url, body);
const listing = (over = {}) => ({ name: "Elm St 2B", city: "Boston", rent: 210000, ...over });

test.beforeEach(() => {
  store = new BrowserStore(memoryStorage());
});

test("listings: defaults, sort by rent, city and status filters", async () => {
  const a = (await call("POST", "/api/future/listings", listing())).body as Listing;
  assert.deepEqual([a.status, a.amenities], ["saved", []]);
  await call("POST", "/api/future/listings", listing({ name: "Cheap", rent: 150000, city: "boston", status: "toured" }));
  await call("POST", "/api/future/listings", listing({ name: "Heights", city: "Boston Heights" }));
  await call("POST", "/api/future/listings", listing({ name: "Odd", city: "St. Paul (West)" }));
  const names = async (qs: string) => ((await call("GET", `/api/future/listings${qs}`)).body as Listing[]).map((l) => l.name);
  assert.deepEqual((await names("")).slice(0, 1), ["Cheap"]);
  assert.deepEqual(await names("?city=BOSTON"), ["Cheap", "Elm St 2B"]);
  assert.deepEqual(await names("?city=St.%20Paul%20(West)"), ["Odd"]);
  assert.deepEqual(await names("?city=St%20Paul%20(West)"), []);
  assert.deepEqual(await names("?status=toured"), ["Cheap"]);
  assert.equal((await names("?status=bogus")).length, 4);
});

test("listings: PUT clears omitted optional fields, PATCH changes status only", async () => {
  const a = (await call("POST", "/api/future/listings", listing({ beds: 2, notes: "nice", rating: 4 }))).body as Listing;
  const put = (await call("PUT", `/api/future/listings/${a._id}`, listing({ beds: 3 }))).body as Listing;
  assert.deepEqual([put.beds, "notes" in put, "rating" in put], [3, false, false]);
  const patched = (await call("PATCH", `/api/future/listings/${a._id}`, { status: "applied" })).body as Listing;
  assert.deepEqual([patched.status, patched.beds, patched.name], ["applied", 3, "Elm St 2B"]);
  assert.equal((await call("PATCH", `/api/future/listings/${a._id}`, { status: "nope" })).status, 400);
});

test("deleting a listing removes its tours", async () => {
  const a = (await call("POST", "/api/future/listings", listing())).body as Listing;
  const b = (await call("POST", "/api/future/listings", listing({ name: "Other" }))).body as Listing;
  await call("POST", "/api/future/tours", { listingId: a._id, date: "2026-12-01" });
  await call("POST", "/api/future/tours", { listingId: b._id, date: "2026-12-02" });
  assert.deepEqual(await call("DELETE", `/api/future/listings/${a._id}`), { status: 200, body: { message: "Listing deleted" } });
  assert.deepEqual(((await call("GET", "/api/future/tours")).body as Tour[]).map((t) => t.listingId), [b._id]);
});

test("tours: listing must exist, sorted by date then time with untimed first, PUT clears time", async () => {
  const a = (await call("POST", "/api/future/listings", listing())).body as Listing;
  for (const listingId of ["abc", "a".repeat(24)]) {
    assert.deepEqual(await call("POST", "/api/future/tours", { listingId, date: "2026-12-01" }), { status: 400, body: { error: "That listing no longer exists" } });
  }
  const late = (await call("POST", "/api/future/tours", { listingId: a._id, date: "2026-12-05", time: "14:30" })).body as Tour;
  await call("POST", "/api/future/tours", { listingId: a._id, date: "2026-12-05" });
  await call("POST", "/api/future/tours", { listingId: a._id, date: "2026-12-01", time: "09:00" });
  const order = ((await call("GET", "/api/future/tours")).body as Tour[]).map((t) => [t.date, t.time]);
  assert.deepEqual(order, [["2026-12-01", "09:00"], ["2026-12-05", undefined], ["2026-12-05", "14:30"]]);
  const put = (await call("PUT", `/api/future/tours/${late._id}`, { listingId: a._id, date: "2026-12-06" })).body as Tour;
  assert.deepEqual([put.date, "time" in put], ["2026-12-06", false]);
  assert.equal((await call("PUT", `/api/future/tours/${late._id}`, { listingId: "a".repeat(24), date: "2026-12-06" })).status, 400);
});

test("settings: one record, created on first PUT, omitted fields cleared", async () => {
  assert.deepEqual((await call("GET", "/api/future/settings")).body, { annualSalary: undefined, commuteDestination: undefined });
  await call("PUT", "/api/future/settings", { annualSalary: 9000000, commuteDestination: "Downtown" });
  const second = await call("PUT", "/api/future/settings", { annualSalary: 9500000 });
  assert.deepEqual(second, { status: 200, body: { annualSalary: 9500000, commuteDestination: undefined } });
  assert.equal(await store.collection("futureSettings").count(), 1);
});

test("validation is 400; unknown and malformed ids are 404", async () => {
  assert.equal((await call("POST", "/api/future/listings", listing({ rent: 0 }))).status, 400);
  assert.equal((await call("POST", "/api/future/tours", { listingId: "x", date: "12/01/2026" })).status, 400);
  for (const id of ["abc", "a".repeat(24)]) {
    assert.deepEqual(await call("PUT", `/api/future/listings/${id}`, listing()), { status: 404, body: { error: "Listing not found" } });
    assert.deepEqual(await call("DELETE", `/api/future/listings/${id}`), { status: 404, body: { error: "Listing not found" } });
    assert.deepEqual(await call("DELETE", `/api/future/tours/${id}`), { status: 404, body: { error: "Tour not found" } });
  }
});
