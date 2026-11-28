// Creates the first admin account and prints its 10 recovery codes once. Needs a terminal: the
// password is read twice without echo, and there is no flag or variable that supplies it.
//
//   node --experimental-strip-types --no-warnings --import ./scripts/register-ts.mjs \
//     scripts/auth/create-admin.ts --db <name> --email <email> --name <name> [--uri <uri>]
//
// Stop the app first. Connects only to the database named by --db.

import mongoose from "mongoose";
import AuthUser from "@/models/auth/AuthUser";
import { passwordProblem } from "@/lib/auth/password-rules";
import { hashPassword } from "@/lib/auth/server/password";
import { generateRecoveryCodes } from "@/lib/auth/server/recovery-codes";
import { flagValue, parseTarget } from "@/lib/auth/server/script-target";
import { connectTo } from "./target";

/** Reads one line from the terminal with echo off. Only called when stdin is a TTY. */
function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const done = (fn: () => void) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stdout.write("\n");
      fn();
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return done(() => resolve(value));
        if (ch === "\u0003") return done(() => reject(new Error("Cancelled")));
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const target = parseTarget(process.argv.slice(2));
  const email = flagValue(target.rest, "--email")?.trim().toLowerCase();
  const name = flagValue(target.rest, "--name")?.trim();
  if (!email || !name) throw new Error("--email and --name are required");
  if (!process.stdin.isTTY) throw new Error("Refusing: stdin is not a terminal, so the password cannot be read safely. Run this in a terminal.");

  await connectTo(target);
  try {
    if (await AuthUser.exists({ email })) throw new Error(`Refusing: ${email} already exists`);

    const password = await readHidden("Password: ");
    const again = await readHidden("Password again: ");
    if (password !== again) throw new Error("The two passwords differ");
    const problem = passwordProblem(password, { email });
    if (problem) throw new Error(problem);

    const { codes, hashes } = generateRecoveryCodes();
    const user = await AuthUser.create({
      email,
      name,
      passwordHash: await hashPassword(password),
      role: "admin",
      passwordChangedAt: new Date(),
      recoveryCodes: hashes.map((hash) => ({ hash })),
    });
    console.log(`Created admin ${email} (id ${user.id}) in ${target.db}.`);
    console.log("Recovery codes (shown once; keep them somewhere safe):");
    for (const code of codes) console.log(`  ${code}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
