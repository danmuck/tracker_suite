// Key handling for reading a password from a raw-mode terminal without echo. Pure: the script
// feeds it each chunk stdin delivers and acts on the result. Server-only.

type EscapeMode = "none" | "esc" | "csi" | "ss3";

export type HiddenReader = { readonly value: string; readonly mode: EscapeMode };

export type HiddenFeed =
  | { status: "reading"; reader: HiddenReader }
  /** `rest` is whatever followed the newline in the same chunk (a paste): feed it to the next reader. */
  | { status: "done"; value: string; rest: string }
  | { status: "cancelled" };

export function startHidden(): HiddenReader {
  return { value: "", mode: "none" };
}

const ESC = "\u001b";
const CTRL_C = "\u0003";
const CTRL_D = "\u0004";
const BACKSPACE = new Set(["\u007f", "\b"]);

/**
 * Applies one chunk. Enter (CR or LF) ends the line; Ctrl-C cancels; Ctrl-D cancels on an empty
 * line; backspace deletes one code point; escape sequences (CSI `ESC [ ... final`, SS3 `ESC O x`,
 * and `ESC x`) and other control characters add nothing. A sequence may span chunks.
 */
export function feedHidden(reader: HiddenReader, chunk: string): HiddenFeed {
  let chars = Array.from(reader.value);
  let mode = reader.mode;
  const input = Array.from(chunk);
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (mode === "esc") {
      mode = ch === "[" ? "csi" : ch === "O" ? "ss3" : "none";
      continue;
    }
    if (mode === "ss3") {
      mode = "none";
      continue;
    }
    if (mode === "csi") {
      const code = ch.codePointAt(0)!;
      if (code >= 0x40 && code <= 0x7e) mode = "none"; // final byte; parameters and intermediates are skipped
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      const next = ch === "\r" && input[i + 1] === "\n" ? i + 2 : i + 1;
      return { status: "done", value: chars.join(""), rest: input.slice(next).join("") };
    }
    if (ch === CTRL_C) return { status: "cancelled" };
    if (ch === CTRL_D) {
      if (chars.length === 0) return { status: "cancelled" };
      continue;
    }
    if (ch === ESC) {
      mode = "esc";
      continue;
    }
    if (BACKSPACE.has(ch)) {
      chars = chars.slice(0, -1);
      continue;
    }
    if (ch < " ") continue;
    chars.push(ch);
  }
  return { status: "reading", reader: { value: chars.join(""), mode } };
}
