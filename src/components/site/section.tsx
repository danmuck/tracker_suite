import { cn } from "@/lib/utils";

interface SectionProps {
  id: string;
  label: string;
  /** Right-aligned content on the label row. */
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** A landing-page section: a small mono label over a hairline, then content. */
export function Section({ id, label, aside, className, children }: SectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-label`} className={cn("py-12 sm:py-16", className)}>
      <div className="mb-8 flex items-center gap-4">
        <h2
          id={`${id}-label`}
          className="font-mono text-xs uppercase tracking-widest text-muted-foreground"
        >
          {label}
        </h2>
        <span aria-hidden className="h-px flex-1 bg-border" />
        {aside}
      </div>
      {children}
    </section>
  );
}
