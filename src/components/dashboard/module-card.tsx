import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { modules } from "@/lib/modules";
import { cn } from "@/lib/utils";

/** Home dashboard card for one module: icon, name and a link in, then the module's overview */
export function ModuleCard({
  moduleId,
  href,
  isLoading,
  wide = false,
  children,
}: {
  moduleId: string;
  href: string;
  isLoading: boolean;
  /** Take two grid columns instead of one */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const mod = modules.find((m) => m.id === moduleId)!;
  return (
    <Card className={cn("h-full", wide && "sm:col-span-2")}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-md text-white"
              style={{ backgroundColor: mod.accentColor }}
            >
              <mod.icon className="h-4 w-4" />
            </div>
            <CardTitle className="text-base">{mod.label}</CardTitle>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href={href} aria-label={`Open ${mod.label}`}>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{isLoading ? <CardSkeleton /> : children}</CardContent>
    </Card>
  );
}

function CardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-32" />
      </div>
      <Skeleton className="h-[72px] w-full" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}

/** Small label over the card's one big value, with an optional line under it */
export function Headline({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Caption over a mini chart, with an optional legend on the right */
export function ChartBlock({
  caption,
  legend,
  children,
}: {
  caption: string;
  legend?: { label: string; color: string }[];
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{caption}</span>
        {legend && (
          <span className="flex items-center gap-3">
            {legend.map((l) => (
              <span key={l.label} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: l.color }} />
                {l.label}
              </span>
            ))}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

export function StatRows({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1.5 border-t pt-3 text-sm">{children}</div>;
}

/** Label on the left, value on the right; the whole row links when `href` is set */
export function StatRow({ label, value, href }: { label: string; value: React.ReactNode; href?: string }) {
  const row = (
    <>
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium tabular-nums [overflow-wrap:anywhere]">{value}</span>
    </>
  );
  const className = "flex items-baseline justify-between gap-4";
  return href ? (
    <Link href={href} className={cn(className, "rounded-sm hover:underline")}>
      {row}
    </Link>
  ) : (
    <div className={className}>{row}</div>
  );
}
