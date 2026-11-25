/** The message of a failed request, or `fallback` */
export const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

/** A refusal from Mirage or from this app's server, word for word */
export function MirageRefusal({ message, title = "Refused" }: { message: string; title?: string }) {
  return (
    <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
      <p className="font-medium text-destructive">{title}</p>
      <p className="mt-1 font-mono text-xs break-words">{message}</p>
    </div>
  );
}

/** A feature that is switched off by server configuration, with the reason */
export function NotConfigured({ message }: { message: string }) {
  return (
    <div role="status" className="rounded-md border bg-muted/40 p-3 text-sm">
      <p className="font-medium">Not configured</p>
      <p className="mt-1 text-xs break-words text-muted-foreground">{message}</p>
    </div>
  );
}
