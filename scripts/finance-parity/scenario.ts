// The Finance parity scenario: an ordered list of requests that drives every Finance route from an
// empty database. A pure function of today's date (yyyy-MM-dd); nothing here touches the network.
//
// `{name}` in `path`, in any string inside `body`, and in object keys of `body` is replaced with the id
// saved under that name. `save.from` is a dot path into the response body. `expect` is the status the
// unconverted code returns (null = record whatever comes back). `allow` marks a step whose response
// changes by decision D1a (malformed path id → the route's 404) or D1c (malformed JSON body → 400).

export interface Step {
  id: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  rawBody?: string;
  save?: { name: string; from: string };
  expect: number | null;
  allow?: { rule: "D1a" | "D1c"; status: number; error?: string };
}

// ── Date helpers: pure string math on noon-UTC dates ──

const DAY_MS = 86_400_000;

function noon(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00.000Z`);
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const pad = (n: number) => String(n).padStart(2, "0");

export function buildScenario(today: string): Step[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error(`today must be yyyy-MM-dd, got ${today}`);
  const T = today;
  const base = noon(T);
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth(); // 0-based

  /** T plus n days */
  const d = (n: number) => ymd(new Date(base.getTime() + n * DAY_MS));
  /** year and 0-based month, k months from T's month */
  const ym = (k: number) => {
    const total = year * 12 + month + k;
    return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 };
  };
  /** First day of the month k months from T's month */
  const som = (k: number) => {
    const { y, m } = ym(k);
    return `${y}-${pad(m + 1)}-01`;
  };
  /** Last day of the month k months from T's month */
  const eom = (k: number) => {
    const { y, m } = ym(k);
    const last = new Date(Date.UTC(y, m + 1, 0, 12)).getUTCDate();
    return `${y}-${pad(m + 1)}-${pad(last)}`;
  };
  /** Day n of the month k months from T's month */
  const dom = (k: number, n: number) => {
    const { y, m } = ym(k);
    return `${y}-${pad(m + 1)}-${pad(n)}`;
  };

  const B = "bbbbbbbbbbbbbbbbbbbbbbbb"; // well-formed id that does not exist
  const RAW = "{";
  const validAccount = { name: "x", type: "bank", balance: 0 };
  const validTx = { amount: 1.11, date: d(-2), description: "x", accountId: "{checking}", type: "debit" };

  const d1a = (error: string) => ({ rule: "D1a" as const, status: 404, error });
  const d1c = (error?: string) => ({ rule: "D1c" as const, status: 400, ...(error ? { error } : {}) });

  const ACCOUNT_NOT_FOUND = "Account not found";
  const TX_NOT_FOUND = "Transaction not found";

  // ── Bodies reused across steps ──

  const t01 = { amount: 3000, date: d(-20), description: "Parity paycheck", accountId: "{checking}", type: "credit", categoryTags: ["salary"] };
  const t03 = { amount: 60, date: d(-18), description: "Parity subscription", accountId: "{card}", type: "debit", categoryTags: ["subscriptions"] };
  const t08 = { amount: 200, date: d(-13), description: "Parity loan payment", accountId: "{checking}", toAccountId: "{loan}", type: "transfer", categoryTags: ["loans", "transfer"] };
  const t12 = {
    amount: 2100,
    date: d(-28),
    description: "Parity Salary",
    accountId: "{checking}",
    type: "credit",
    isRecurring: true,
    recurrenceRule: { frequency: "biweekly", startDate: d(-28) },
    categoryTags: ["salary"],
  };
  const p05 = { fromAccountId: "{checking}", dayOfMonth: 15, startDate: dom(-3, 15), firstAmount: 45 };
  const p14 = { schedule: [{ effectiveDate: dom(-3, 5), amount: 250 }, { effectiveDate: dom(6, 5), amount: 300 }] };

  const PROFILE = {
    filingStatus: "single",
    hoursPerWeek: 40,
    nycResident: true,
    raiseRate: 0.03,
    salaryTransactionId: "{salary}",
    rentTransactionId: "{rent}",
    salarySteps: [
      { effectiveDate: som(-14), annualGross: 85000 },
      { effectiveDate: som(3), annualGross: 92000 },
    ],
    retirementSteps: [{ effectiveDate: som(-14), percent: 0.06 }],
    healthSteps: [{ effectiveDate: som(-14), perPaycheck: 85 }],
    rentSteps: [
      { effectiveDate: som(-2), monthly: 1450 },
      { effectiveDate: som(2), monthly: 1525 },
    ],
    whatIfSalaries: [{ label: "  Stretch ", annualGross: 120000 }, { annualGross: 70000 }],
  };

  const get = (id: string, path: string, expect: number | null, extra: Partial<Step> = {}): Step => ({ id, method: "GET", path, expect, ...extra });
  const send = (id: string, method: Step["method"], path: string, body: unknown, expect: number | null, extra: Partial<Step> = {}): Step => ({
    id,
    method,
    path,
    body,
    expect,
    ...extra,
  });
  const raw = (id: string, method: Step["method"], path: string, expect: number | null, extra: Partial<Step> = {}): Step => ({
    id,
    method,
    path,
    rawBody: RAW,
    expect,
    ...extra,
  });
  const del = (id: string, path: string, expect: number | null, extra: Partial<Step> = {}): Step => ({ id, method: "DELETE", path, expect, ...extra });

  const plan = (account: string) => `/api/accounts/${account}/payment-plan`;

  return [
    // ── Accounts ──
    get("A01", "/api/accounts", 200, { save: { name: "cash", from: "0._id" } }),
    get("A02", "/api/categories", 200),
    send("A03", "POST", "/api/accounts", { name: "Parity Checking", type: "bank", balance: 5000 }, 201, { save: { name: "checking", from: "_id" } }),
    send("A04", "POST", "/api/accounts", { name: "  Parity Savings  ", type: "bank", balance: 12000.5, notes: "  rainy day  " }, 201, {
      save: { name: "savings", from: "_id" },
    }),
    send("A05", "POST", "/api/accounts", { name: "Parity Card", type: "credit_card", balance: 400, creditLimit: 1000, apr: 24.99, minimumPayment: 35 }, 201, {
      save: { name: "card", from: "_id" },
    }),
    send("A06", "POST", "/api/accounts", { name: "Parity Student Loan", type: "debt", balance: 20000, apr: 6.5 }, 201, { save: { name: "loan", from: "_id" } }),
    send(
      "A07",
      "POST",
      "/api/accounts",
      { name: "Parity Car Loan", type: "debt", balance: 8000, isLoan: true, linkedAccountId: "{checking}", depositFunds: true, apr: 7.25, minimumPayment: 150 },
      201,
      { save: { name: "car", from: "_id" } },
    ),
    send("A08", "POST", "/api/accounts", { name: "Parity Orphan Loan", type: "debt", balance: 50, isLoan: true, linkedAccountId: B, depositFunds: true }, 400),
    send("A09", "POST", "/api/accounts", { name: "", type: "nope", balance: "x" }, 400),
    raw("A10", "POST", "/api/accounts", 500, { allow: d1c("Validation failed") }),
    get("A11", "/api/accounts", 200),
    get("A12", "/api/accounts?type=bank", 200),
    get("A13", "/api/accounts?includeArchived=true", 200),
    get("A14", "/api/accounts?type=debt&includeArchived=true", 200),
    get("A15", "/api/accounts/{checking}", 200),
    get("A16", `/api/accounts/${B}`, 404),
    get("A17", "/api/accounts/abc", 500, { allow: d1a(ACCOUNT_NOT_FOUND) }),
    send(
      "A18",
      "PUT",
      "/api/accounts/{card}",
      { name: "Parity Card", type: "credit_card", balance: 400, creditLimit: 1500, apr: null, minimumPayment: 40, depositFunds: true },
      200,
    ),
    send("A19", "PUT", "/api/accounts/{cash}", { name: "Cash", type: "debt", balance: 0 }, 400),
    send("A20", "PUT", "/api/accounts/{cash}", { name: "Cash", type: "bank", balance: 25 }, 200),
    send("A21", "PUT", "/api/accounts/{checking}", { name: "x" }, 400),
    send("A22", "PUT", `/api/accounts/${B}`, validAccount, 404),
    send("A23", "PUT", "/api/accounts/abc", validAccount, 500, { allow: d1a(ACCOUNT_NOT_FOUND) }),
    raw("A24", "PUT", "/api/accounts/{checking}", 500, { allow: d1c("Validation failed") }),
    send("A25", "PATCH", "/api/accounts/{savings}", { isArchived: true }, 200),
    get("A26", "/api/accounts", 200),
    get("A27", "/api/accounts?includeArchived=true", 200),
    send("A28", "PATCH", "/api/accounts/{savings}", { isArchived: false }, 200),
    send("A29", "PATCH", "/api/accounts/{cash}", { isArchived: true }, 403),
    send("A30", "PATCH", "/api/accounts/{checking}", { isArchived: "yes" }, 400),
    send("A31", "PATCH", `/api/accounts/${B}`, { isArchived: true }, 404),
    send("A32", "PATCH", "/api/accounts/abc", { isArchived: true }, 500, { allow: d1a(ACCOUNT_NOT_FOUND) }),

    // ── Categories ──
    send("C01", "POST", "/api/categories", { name: "Parity Pets", color: "#112233", icon: "Dog" }, 201),
    send("C02", "POST", "/api/categories", { name: "  PARITY pets ", color: "#112233", icon: "Dog" }, 400),
    send("C03", "POST", "/api/categories", { name: "x", color: "red", icon: "Dog" }, 400),
    get("C04", "/api/categories", 200),

    // ── Transactions ──
    send("T01", "POST", "/api/transactions", t01, 201, { save: { name: "tPay", from: "_id" } }),
    send(
      "T02",
      "POST",
      "/api/transactions",
      { amount: 120.55, date: d(-19), description: "  Parity groceries ", accountId: "{checking}", type: "debit", categoryTags: ["spending"], notes: "  weekly shop " },
      201,
      { save: { name: "tGroc", from: "_id" } },
    ),
    send("T03", "POST", "/api/transactions", t03, 201, { save: { name: "tSub", from: "_id" } }),
    send("T04", "POST", "/api/transactions", { amount: 25, date: d(-17), description: "Parity refund", accountId: "{card}", type: "credit", categoryTags: ["other"] }, 201),
    send(
      "T05",
      "POST",
      "/api/transactions",
      { amount: 500, date: d(-16), description: "Parity to savings", accountId: "{checking}", toAccountId: "{savings}", type: "transfer", categoryTags: ["transfer"] },
      201,
      { save: { name: "tSav", from: "_id" } },
    ),
    // Capped at what is owed on the card
    send(
      "T06",
      "POST",
      "/api/transactions",
      { amount: 10000, date: d(-15), description: "Parity card payoff", accountId: "{checking}", toAccountId: "{card}", type: "transfer", categoryTags: ["credit", "transfer"] },
      201,
      { save: { name: "tPayoff", from: "_id" } },
    ),
    // Capped by the card's credit limit
    send(
      "T07",
      "POST",
      "/api/transactions",
      { amount: 5000, date: d(-14), description: "Parity cash advance", accountId: "{card}", toAccountId: "{checking}", type: "transfer", categoryTags: ["transfer"] },
      201,
      { save: { name: "tAdv", from: "_id" } },
    ),
    send("T08", "POST", "/api/transactions", t08, 201, { save: { name: "tLoan", from: "_id" } }),
    send(
      "T09",
      "POST",
      "/api/transactions",
      { amount: 10, date: d(1), description: "Parity tomorrow", accountId: "{checking}", type: "debit", categoryTags: ["spending"] },
      201,
      { save: { name: "tTom", from: "_id" } },
    ),
    send(
      "T10",
      "POST",
      "/api/transactions",
      { amount: 75, date: d(5), description: "Parity future bill", accountId: "{checking}", type: "debit", categoryTags: ["bills"] },
      201,
      { save: { name: "tFuture", from: "_id" } },
    ),
    send(
      "T11",
      "POST",
      "/api/transactions",
      { amount: 50, date: d(6), description: "Parity future transfer", accountId: "{checking}", toAccountId: "{savings}", type: "transfer", categoryTags: ["transfer"] },
      201,
    ),
    send("T12", "POST", "/api/transactions", t12, 201, { save: { name: "salary", from: "_id" } }),
    send(
      "T13",
      "POST",
      "/api/transactions",
      {
        amount: 1450,
        date: som(-2),
        description: "Parity Rent",
        accountId: "{checking}",
        type: "debit",
        isRecurring: true,
        recurrenceRule: { frequency: "monthly", startDate: som(-2), dayOfMonth: 1 },
        categoryTags: ["bills"],
      },
      201,
      { save: { name: "rent", from: "_id" } },
    ),
    send(
      "T14",
      "POST",
      "/api/transactions",
      {
        amount: 1650,
        date: som(4),
        description: "Parity Rent (new lease)",
        accountId: "{checking}",
        type: "debit",
        isRecurring: true,
        recurrenceRule: { frequency: "monthly", startDate: som(4), endDate: som(16), dayOfMonth: 1 },
        categoryTags: ["bills"],
      },
      201,
      { save: { name: "rent2", from: "_id" } },
    ),
    send(
      "T15",
      "POST",
      "/api/transactions",
      {
        amount: 20,
        date: dom(-3, 25),
        description: "Parity semi-monthly",
        accountId: "{checking}",
        type: "debit",
        isRecurring: true,
        recurrenceRule: { frequency: "semi_monthly", startDate: dom(-3, 25) },
        categoryTags: ["other"],
      },
      201,
    ),
    send(
      "T16",
      "POST",
      "/api/transactions",
      {
        amount: 80,
        date: dom(-3, 20),
        description: "Parity auto-save",
        accountId: "{checking}",
        toAccountId: "{savings}",
        type: "transfer",
        isRecurring: true,
        recurrenceRule: { frequency: "weekly", interval: 2, startDate: dom(-3, 20), endDate: "" },
        categoryTags: ["transfer"],
      },
      201,
    ),
    send("T17", "POST", "/api/transactions", { ...validTx, type: "transfer" }, 400),
    send("T18", "POST", "/api/transactions", { ...validTx, type: "transfer", toAccountId: "{checking}" }, 400),
    send("T19", "POST", "/api/transactions", { ...validTx, type: "transfer", toAccountId: B }, 400),
    send("T20", "POST", "/api/transactions", { ...validTx, amount: 0 }, 400),
    raw("T21", "POST", "/api/transactions", 500, { allow: d1c("Validation failed") }),
    send("T22", "POST", "/api/transactions", { ...validTx, accountId: "abc" }, 500),
    get("T23", "/api/transactions", 200),
    get("T24", "/api/transactions?page=2&limit=5", 200),
    get("T25", "/api/transactions?accountId={checking}&sort=date&order=asc&limit=100", 200),
    get("T26", "/api/transactions?type=transfer&limit=100", 200),
    get("T27", "/api/transactions?category=salary", 200),
    get("T28", "/api/transactions?isRecurring=true", 200),
    get("T29", "/api/transactions?isRecurring=false&limit=100", 200),
    get("T30", "/api/transactions?search=PARITY%20f", 200),
    get("T31", `/api/transactions?startDate=${d(-19)}&endDate=${d(-14)}&sort=date&order=asc`, 200),
    get("T32", "/api/transactions?sort=amount&order=asc&limit=100", 200),
    get("T33", "/api/transactions?accountId=abc", 500),
    get("T34", "/api/transactions/{tGroc}", 200),
    get("T35", `/api/transactions/${B}`, 404),
    get("T36", "/api/transactions/abc", 500, { allow: d1a(TX_NOT_FOUND) }),
    send(
      "T37",
      "PUT",
      "/api/transactions/{tGroc}",
      { amount: 130.25, date: d(-19), description: "Parity groceries (edited)", accountId: "{checking}", type: "debit", categoryTags: ["spending"] },
      200,
    ),
    send("T38", "PUT", "/api/transactions/{tSub}", { ...t03, date: d(7) }, 200),
    send("T39", "PUT", "/api/transactions/{tSub}", t03, 200),
    send(
      "T40",
      "PUT",
      "/api/transactions/{tSav}",
      { amount: 500, date: d(-16), description: "Parity to savings", accountId: "{checking}", type: "debit", categoryTags: ["transfer"] },
      200,
    ),
    send(
      "T41",
      "PUT",
      "/api/transactions/{tTom}",
      {
        amount: 10,
        date: d(1),
        description: "Parity tomorrow",
        accountId: "{checking}",
        type: "debit",
        isRecurring: true,
        recurrenceRule: { frequency: "weekly", startDate: d(1), dayOfWeek: 3 },
        categoryTags: ["spending"],
      },
      200,
    ),
    send("T42", "PUT", "/api/transactions/{tLoan}", { ...t08, toAccountId: B }, 400),
    get("T43", "/api/accounts", 200),
    send("T44", "PUT", "/api/transactions/{tPay}", { ...t01, amount: -5 }, 400),
    send("T45", "PUT", `/api/transactions/${B}`, validTx, 404),
    send("T46", "PUT", "/api/transactions/abc", validTx, 500, { allow: d1a(TX_NOT_FOUND) }),
    raw("T47", "PUT", "/api/transactions/{tPay}", 500, { allow: d1c("Validation failed") }),
    del("T48", "/api/transactions/{tGroc}", 200),
    del("T49", "/api/transactions/{tAdv}", 200),
    del("T50", "/api/transactions/{tFuture}", 200),
    del("T51", `/api/transactions/${B}`, 404),
    del("T52", "/api/transactions/abc", 500, { allow: d1a(TX_NOT_FOUND) }),
    send("T53", "POST", "/api/transactions", { amount: 100, date: d(-3), description: "Parity card charge", accountId: "{card}", type: "debit", categoryTags: ["spending"] }, 201),
    get("T54", "/api/accounts", 200),
    get("T55", "/api/transactions?limit=100&sort=date&order=asc", 200),

    // ── Payment plans ──
    get("P01", plan("{card}"), 200),
    get("P02", plan("{checking}"), 400),
    get("P03", plan(B), 404),
    get("P04", plan("abc"), 500, { allow: d1a(ACCOUNT_NOT_FOUND) }),
    send("P05", "POST", plan("{card}"), p05, 200, { save: { name: "cardPay", from: "data.payment.transactionId" } }),
    // Catch-up payments post here: 45 + 45 + 10, capped at the 100 owed
    get("P06", "/api/accounts", 200),
    send("P07", "POST", plan("{card}"), p05, 409),
    send("P08", "POST", plan("{loan}"), { fromAccountId: "{card}", dayOfMonth: 5, startDate: d(10), firstAmount: 250 }, 400),
    send("P09", "POST", plan("{loan}"), { fromAccountId: "", dayOfMonth: 5, startDate: d(10), firstAmount: 250 }, 400),
    raw("P10", "POST", plan("{loan}"), 500, { allow: d1c() }),
    // Backdated: its catch-up payments post at P12
    send("P11", "POST", plan("{loan}"), { fromAccountId: "{checking}", dayOfMonth: 5, startDate: dom(-3, 5), firstAmount: 250 }, 200, {
      save: { name: "loanPay", from: "data.payment.transactionId" },
    }),
    send(
      "P12",
      "PUT",
      plan("{loan}"),
      {
        subLoans: [
          { name: " Sub A ", balance: 12000, apr: 5.5 },
          { name: "Sub B", balance: 8000, apr: 7 },
        ],
      },
      200,
    ),
    send("P13", "PUT", plan("{loan}"), { rap: { enabled: true, autoSchedule: true, recertDate: "07-01", dependents: 1 } }, 200),
    send("P14", "PUT", plan("{loan}"), p14, 200),
    get("P14b", "/api/transactions/{loanPay}", 200),
    send("P15", "PUT", plan("{loan}"), p14, 200),
    // Its updatedAt marker must be <same>: P15 wrote nothing
    get("P16", "/api/transactions/{loanPay}", 200),
    send("P17", "PUT", plan("{card}"), { rap: { enabled: true, autoSchedule: true, recertDate: "07-01", dependents: 0 } }, 400),
    send(
      "P18",
      "PUT",
      plan("{card}"),
      { schedule: [{ effectiveDate: dom(-3, 15), amount: 55 }], rap: { enabled: true, autoSchedule: true, recertDate: "07-01", dependents: 0 } },
      400,
    ),
    get("P19", "/api/transactions/{cardPay}", 200),
    send("P20", "PUT", plan("{car}"), { schedule: [{ effectiveDate: d(10), amount: 100.5 }] }, 409),
    send(
      "P21",
      "PUT",
      plan("{loan}"),
      {
        schedule: [
          { effectiveDate: d(10), amount: 1 },
          { effectiveDate: d(10), amount: 2 },
        ],
      },
      400,
    ),

    // ── Finance profile (Datasheet) ──
    get("F01", "/api/finance-profile", 200),
    send("F02", "PUT", "/api/finance-profile", { ...PROFILE, salarySteps: [] }, 400),
    send("F03", "PUT", "/api/finance-profile", { ...PROFILE, salaryTransactionId: B }, 409),
    send("F04", "PUT", "/api/finance-profile", { ...PROFILE, rentTransactionId: B }, 409),
    send("F05", "PUT", "/api/finance-profile", PROFILE, 200),
    get("F05b", "/api/transactions/{salary}", 200),
    get("F05c", "/api/transactions/{rent}", 200),
    send("F06", "PUT", "/api/finance-profile", PROFILE, 200),
    // Both updatedAt markers must be <same>: F06 wrote nothing
    get("F07", "/api/transactions/{salary}", 200),
    get("F08", "/api/transactions/{rent}", 200),
    get("F09", plan("{loan}"), 200),
    get("F10", "/api/finance-profile", 200),
    send("F11", "POST", "/api/finance-profile/merge-rent", { keepId: "{rent}", mergeId: "{rent2}" }, 200),
    send("F12", "POST", "/api/finance-profile/merge-rent", { keepId: "{rent}", mergeId: "{rent}" }, 400),
    send("F13", "POST", "/api/finance-profile/merge-rent", { keepId: "{rent}", mergeId: B }, 404),
    send("F14", "POST", "/api/finance-profile/merge-rent", { keepId: "{rent}", mergeId: "{tPay}" }, 404),
    raw("F15", "POST", "/api/finance-profile/merge-rent", 500, { allow: d1c("keepId and mergeId must be two different transactions") }),
    get("F16", "/api/transactions/{rent}", 200),
    send("F17", "PUT", "/api/finance-profile", { ...PROFILE, rentTransactionId: null }, 200),
    get("F18", "/api/transactions/{rent}", 200),
    send("F19", "PUT", "/api/finance-profile", { ...PROFILE, rentSteps: [] }, 200),
    raw("F20", "PUT", "/api/finance-profile", 500, { allow: d1c() }),

    // ── Projections ──
    get("R01", "/api/projections", 400),
    get("R02", `/api/projections?startDate=${som(0)}&endDate=${eom(0)}&granularity=daily`, 200),
    get("R03", `/api/projections?startDate=${som(0)}&endDate=${eom(6)}&granularity=monthly`, 200),
    get("R04", `/api/projections?startDate=${som(2)}&endDate=${eom(4)}&granularity=weekly`, 200),
    get("R05", `/api/projections?startDate=${d(-30)}&endDate=${d(60)}&accountId={checking}`, 200),
    get("R06", `/api/projections?startDate=${d(-30)}&endDate=${d(60)}&accountId={savings}`, 200),
    get("R07", "/api/projections?startDate=1900-01-01&endDate=2100-01-01", 400),
    get("R08", `/api/projections?startDate=${som(0)}&endDate=${eom(0)}&accountId=abc`, 500),
    // Invalid time value: queryStart falls back to today, then the engine throws RangeError
    get("R09", `/api/projections?startDate=garbage&endDate=${eom(0)}`, 400),
    send(
      "R10",
      "POST",
      "/api/projections",
      {
        startDate: som(0),
        endDate: eom(3),
        granularity: "weekly",
        sandbox: {
          added: [
            {
              id: "sandbox-1",
              data: { amount: 999, date: d(12), description: "Parity what-if", accountId: "{checking}", type: "debit", categoryTags: ["spending"] },
            },
          ],
          edited: { "{salary}": { ...t12, amount: 2500 } },
          removed: ["{tPay}"],
          profile: null,
        },
      },
      200,
    ),
    send(
      "R11",
      "POST",
      "/api/projections",
      {
        startDate: som(0),
        endDate: eom(3),
        sandbox: { profile: { ...PROFILE, salarySteps: [{ ...PROFILE.salarySteps[0], annualGross: 99000 }, PROFILE.salarySteps[1]] } },
      },
      200,
    ),
    send("R12", "POST", "/api/projections", {}, 400),
    raw("R13", "POST", "/api/projections", 500, { allow: d1c("Invalid projection request") }),

    // ── Summary ──
    get("R14", `/api/summary?view=monthly&date=${T}`, 200),
    get("R15", `/api/summary?view=weekly&date=${T}`, 200),
    get("R16", `/api/summary?view=annual&date=${T}`, 200),
    get("R17", `/api/summary?view=bogus&date=${T}`, 200),
    get("R18", "/api/summary?view=monthly&date=garbage", 400),
    get("R19", `/api/summary?view=monthly&date=${T}&accountId={checking}`, 200),
    get("R20", `/api/summary?view=monthly&date=${T}&accountId={savings}`, 200),
    get("R21", `/api/summary?view=monthly&date=${T}T12:00:00.000Z`, 200),
    get("R22", "/api/summary", 200),
    get("R23", "/api/summary?accountId=abc", 500),

    // ── Deletes and final state ──
    del("Z01", "/api/accounts/{cash}", 403),
    del("Z02", `/api/accounts/${B}`, 404),
    del("Z03", "/api/accounts/abc", 500, { allow: d1a(ACCOUNT_NOT_FOUND) }),
    del("Z04", "/api/transactions/{loanPay}", 200),
    get("Z05", plan("{loan}"), 200),
    del("Z06", plan("{card}"), 200),
    get("Z07", plan("{card}"), 200),
    del("Z08", "/api/accounts/{savings}", 200),
    // Source of finalBalances: account name → balance
    get("Z09", "/api/accounts?includeArchived=true", 200),
    get("Z10", "/api/transactions?limit=100&sort=date&order=asc", 200),
    get("Z11", "/api/finance-profile", 200),
    get("Z12", "/api/categories", 200),

    // ── Remaining error paths. After the final-state reads, so no earlier step's state changes. ──
    // Payment plans: loadAccount (src/lib/finance/payment-plan.ts:81-87) runs first in every method
    del("X01", plan(B), 404),
    del("X02", plan("{checking}"), 400),
    send("X03", "POST", plan(B), { fromAccountId: "{checking}", dayOfMonth: 5, startDate: d(10), firstAmount: 1 }, 404),
    send("X04", "PUT", plan(B), {}, 404),
    send("X05", "POST", plan("{checking}"), { fromAccountId: "{checking}", dayOfMonth: 5, startDate: d(10), firstAmount: 1 }, 400),
    send("X06", "PUT", plan("{checking}"), {}, 400),
    // Malformed fromAccountId reaches Account.findById (payment-plan.ts:251): a cast error, the route's 500
    send("X07", "POST", plan("{car}"), { fromAccountId: "abc", dayOfMonth: 5, startDate: d(10), firstAmount: 1 }, 500),
    // The engine's window guard (projection-engine.ts:67) through the sandbox path
    send("X08", "POST", "/api/projections", { startDate: "1900-01-01", endDate: "2100-01-01", sandbox: {} }, 400),
    // Malformed linkedAccountId in a body: Mongoose cast errors, the routes' 500s (nothing is written)
    send("X09", "POST", "/api/accounts", { name: "Parity Bad Link", type: "debt", balance: 10, isLoan: true, linkedAccountId: "abc", depositFunds: true }, 500),
    send("X10", "PUT", "/api/accounts/{car}", { name: "Parity Car Loan", type: "debt", balance: 8000, isLoan: true, linkedAccountId: "abc" }, 500),
    // merge-rent: a schema failure is the same 400 as keepId === mergeId (merge-rent/route.ts:17-19)
    send("X11", "POST", "/api/finance-profile/merge-rent", { keepId: "{rent}" }, 400),
    send("X12", "POST", "/api/finance-profile/merge-rent", { keepId: "abc", mergeId: "{rent}" }, 500),
    // Malformed link id reaches Transaction.exists (apply-profile.ts:89): the route's 500
    send("X13", "PUT", "/api/finance-profile", { ...PROFILE, salaryTransactionId: "abc", rentSteps: [] }, 500),
    // merge-rent 409: the profile's Salary link points at a deleted transaction (apply-profile.ts:89-91)
    send(
      "X14",
      "POST",
      "/api/transactions",
      {
        amount: 3333,
        date: dom(-3, 12),
        description: "Parity second salary",
        accountId: "{checking}",
        type: "credit",
        isRecurring: true,
        recurrenceRule: { frequency: "biweekly", startDate: dom(-3, 12) },
        categoryTags: ["salary"],
      },
      201,
      { save: { name: "salary2", from: "_id" } },
    ),
    send("X15", "PUT", "/api/finance-profile", { ...PROFILE, salaryTransactionId: "{salary2}", rentSteps: [] }, 200),
    del("X16", "/api/transactions/{salary2}", 200),
    send(
      "X17",
      "POST",
      "/api/transactions",
      {
        amount: 1555,
        date: dom(2, 3),
        description: "Parity Rent (sublet)",
        accountId: "{checking}",
        type: "debit",
        isRecurring: true,
        recurrenceRule: { frequency: "monthly", startDate: dom(2, 3), dayOfMonth: 3 },
        categoryTags: ["bills"],
      },
      201,
      { save: { name: "rent3", from: "_id" } },
    ),
    // Writes the keep's endDate and deletes the merged transaction before the link check throws
    send("X18", "POST", "/api/finance-profile/merge-rent", { keepId: "{rent}", mergeId: "{rent3}" }, 409),
    get("X19", "/api/transactions/{rent}", 200),
    get("X20", "/api/transactions?limit=100&sort=date&order=asc", 200),
    get("X21", "/api/finance-profile", 200),
  ];
}
