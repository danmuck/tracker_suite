// How to show a seed_result's output. Mirage sends stdout and stderr as text when both are
// valid UTF-8, otherwise both as base64. base64 output is binary: it is never decoded to text.

import type { SeedResult } from "@/types/edgectl/api";

export type OutputView =
  | { kind: "text"; stdout: string; stderr: string }
  | { kind: "binary"; stdout: string; stderr: string; stdoutBytes: number; stderrBytes: number };

/** Decoded size of a base64 string, without decoding it */
export function base64ByteLength(value: string): number {
  const clean = value.replace(/\s/g, "");
  if (clean === "") return 0;
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

export function outputView(result: Pick<SeedResult, "stdout" | "stderr" | "output_encoding">): OutputView {
  if (result.output_encoding === "base64") {
    return {
      kind: "binary",
      stdout: result.stdout,
      stderr: result.stderr,
      stdoutBytes: base64ByteLength(result.stdout),
      stderrBytes: base64ByteLength(result.stderr),
    };
  }
  return { kind: "text", stdout: result.stdout, stderr: result.stderr };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} byte${bytes === 1 ? "" : "s"}`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
