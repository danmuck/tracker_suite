/** A landing-page section: small label, a rule filling the row, an optional note on the right */
export function Section({
  id,
  label,
  aside,
  children,
}: {
  id: string;
  label: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="py-12 sm:py-16">
      <div className="mb-8 flex items-center gap-4">
        <h2 className="text-muted-foreground shrink-0 font-mono text-xs tracking-widest uppercase">
          {label}
        </h2>
        <div className="bg-brand h-px min-w-4 flex-1" />
        {aside ? (
          <div className="text-muted-foreground text-right font-mono text-xs">{aside}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}
