import { localRequest } from "@/lib/data/local";
import { getDataSource } from "@/lib/data/mode";

export const fetcher = (url: string) => {
  if (getDataSource() === "browser") return localRequest("GET", url);
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Request failed: ${r.status}`);
    return r.json();
  });
};

export async function send<T = unknown>(url: string, method: string, body?: unknown): Promise<T> {
  if (getDataSource() === "browser") return localRequest<T>(method, url, body);
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}
