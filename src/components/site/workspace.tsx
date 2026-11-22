"use client";

import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import { addDays } from "date-fns";
import { ArrowRight, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Section } from "@/components/site/section";
import { modules, type SuiteModule } from "@/config/modules";
import { useAccounts } from "@/hooks/use-accounts";
import { useProjections } from "@/hooks/use-projections";
import { useSummary } from "@/hooks/use-summary";
import { netWorth } from "@/lib/finance";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------- status */

interface Health {
  status: "ok" | "degraded";
  db?: { ok: true; latencyMs: number } | { ok: false; error: string };
}

// The health endpoint answers 503 with a body when degraded; read it either way.
const healthFetcher = (url: string): Promise<Health> => fetch(url).then((r) => r.json());

function SystemStatus() {
  const { data, error, isLoading } = useSWR<Health>("/api/health", healthFetcher, {
    refreshInterval: 30_000,
  });

  let tone = "bg-muted-foreground/40";
  let text = "checking";
  if (error || (data && !data.db)) {
    tone = "bg-red-500";
    text = "server unreachable";
  } else if (data?.db?.ok) {
    tone = "bg-green-500";
    text = `db ${data.db.latencyMs} ms`;
  } else if (data?.db) {
    tone = "bg-red-500";
    text = "db unreachable";
  }

  return (
    <span
      role="status"
      title={data?.db && !data.db.ok ? data.db.error : undefined}
      className="flex items-center gap-2 font-mono text-xs text-muted-foreground"
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", tone, isLoading && "animate-pulse")} />
      {text}
    </span>
  );
}

/* --------------------------------------------------------------- summary */

interface StatProps {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative" | "warning";
}

const toneClass: Record<NonNullable<StatProps["tone"]>, string> = {
  default: "",
  positive: "text-green-600 dark:text-green-400",
  negative: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
};

function StatGrid({ stats, loading }: { stats: StatProps[]; loading: boolean }) {
  return (
    <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
      {stats.map(({ label, value, tone = "default" }) => (
        <div key={label} className="bg-card px-5 py-4">
          <dt className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {label}
          </dt>
          <dd className={cn("mt-1.5 text-xl font-semibold tabular-nums", toneClass[tone])}>
            {loading ? <Skeleton className="h-7 w-24" /> : value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SummaryError({ module, what }: { module: SuiteModule; what: string }) {
  const { mutate } = useSWRConfig();
  const retry = () =>
    mutate((key) => typeof key === "string" && key.startsWith(module.apiPrefix));

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-card px-5 py-4">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Couldn’t load {what}.</span> The
        pages below still open; check that the database is running.
      </p>
      <Button variant="outline" size="sm" onClick={retry}>
        <RotateCw className="size-3.5" />
        Retry
      </Button>
    </div>
  );
}

function sign(cents: number): StatProps["tone"] {
  return cents > 0 ? "positive" : cents < 0 ? "negative" : "default";
}

function FinanceSummary({ module }: { module: SuiteModule }) {
  const today = new Date();
  const accounts = useAccounts();
  const summary = useSummary("monthly", today);
  const projection = useProjections(today, addDays(today, 30), "daily");

  if (accounts.isError || summary.isError || projection.isError) {
    return <SummaryError module={module} what="finance totals" />;
  }

  const worth = netWorth(accounts.accounts);
  const monthNet = summary.summary?.totals.net ?? 0;
  const alerts = projection.projection?.alerts.length ?? 0;

  return (
    <StatGrid
      loading={accounts.isLoading || summary.isLoading || projection.isLoading}
      stats={[
        {
          label: "Net worth",
          value: formatCurrency(worth),
          tone: worth < 0 ? "negative" : "default",
        },
        { label: "This month", value: formatCurrency(monthNet), tone: sign(monthNet) },
        { label: "Accounts", value: String(accounts.accounts.length) },
        {
          label: "Alerts · 30 days",
          value: String(alerts),
          tone: alerts > 0 ? "warning" : "default",
        },
      ]}
    />
  );
}

/** Live summary shown on a module's panel, keyed by module id. */
const summaries: Record<string, React.ComponentType<{ module: SuiteModule }>> = {
  finance: FinanceSummary,
};

/* ----------------------------------------------------------------- panel */

function ModulePanel({ module }: { module: SuiteModule }) {
  const Icon = module.icon;
  const Summary = summaries[module.id];
  const [overview, ...pages] = module.nav;

  return (
    <article className="overflow-hidden rounded-lg border bg-card">
      <header className="flex items-center gap-4 px-5 py-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold leading-tight">{module.name}</h3>
          <p className="truncate text-sm text-muted-foreground">{module.description}</p>
        </div>
        <Button asChild size="sm" className="ml-auto shrink-0">
          <Link href={overview.href}>
            Open
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </header>

      {Summary && (
        <div className="border-t">
          <Summary module={module} />
        </div>
      )}

      {pages.length > 0 && (
        <nav
          aria-label={`${module.name} pages`}
          className="flex flex-wrap gap-1 border-t px-3 py-2"
        >
          {pages.map(({ href, label, icon: PageIcon }) => (
            <Button key={href} asChild variant="ghost" size="sm" className="text-muted-foreground">
              <Link href={href}>
                <PageIcon className="size-3.5" />
                {label}
              </Link>
            </Button>
          ))}
        </nav>
      )}
    </article>
  );
}

export function Workspace() {
  return (
    <Section id="workspace" label="Workspace" aside={<SystemStatus />} className="sm:pb-8">
      <div className="space-y-4">
        {modules.map((module) => (
          <ModulePanel key={module.id} module={module} />
        ))}
      </div>
    </Section>
  );
}
