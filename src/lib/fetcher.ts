/**
 * Shared SWR fetcher. Rejects on non-2xx so an error body (`{ error }`) is
 * never mistaken for data by callers that default to `data || []`.
 */
export class FetchError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "FetchError";
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- callers narrow the payload themselves
export async function fetcher(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body?.error === "string") message = body.error;
    } catch {
      // non-JSON error body; keep the status message
    }
    throw new FetchError(message, res.status);
  }
  return res.json();
}
