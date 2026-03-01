export function getFaviconUrl(url: string, size: number = 32): string {
  try {
    const { hostname } = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=${size}`;
  } catch {
    return `https://www.google.com/s2/favicons?domain=example.com&sz=${size}`;
  }
}
