import Account from "@/models/finance/Account";

export async function runSeeds() {
  await Account.findOneAndUpdate(
    { isCash: true },
    { $setOnInsert: { name: "Cash", type: "bank", isCash: true, balance: 0, currency: "USD" } },
    { upsert: true, setDefaultsOnInsert: true }
  );
}
