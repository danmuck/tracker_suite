"use client";

import Link from "next/link";
import { ChartBlock, Headline, ModuleCard, StatRow, StatRows } from "@/components/dashboard/module-card";
import { HBarList } from "@/components/dashboard/spark";
import { useLinkGroups } from "@/hooks/links/use-link-groups";
import { modules } from "@/lib/modules";

const MAX_GROUPS = 5;
const color = modules.find((m) => m.id === "links")!.accentColor;

export function LinksCard() {
  const { groups, isLoading } = useLinkGroups();

  const count = (g: { linkCount?: number }) => g.linkCount ?? 0;
  const totalLinks = groups.reduce((sum, g) => sum + count(g), 0);
  const bySize = [...groups].sort((a, b) => count(b) - count(a) || a.name.localeCompare(b.name));
  const top = bySize.slice(0, MAX_GROUPS);
  const rest = bySize.slice(MAX_GROUPS);
  const maxCount = Math.max(...top.map(count), 1);
  const empty = groups.filter((g) => count(g) === 0).length;

  return (
    <ModuleCard moduleId="links" href="/links" isLoading={isLoading}>
      <Headline
        label="Saved links"
        value={totalLinks}
        sub={`in ${groups.length} group${groups.length !== 1 ? "s" : ""}`}
      />

      {totalLinks > 0 && (
        <ChartBlock caption="Links per group">
          <HBarList
            color={color}
            rows={top.map((g) => ({
              key: g._id,
              label: g.name,
              fraction: count(g) / maxCount,
              value: String(count(g)),
              href: `/links/${g.slug}`,
            }))}
          />
        </ChartBlock>
      )}

      <StatRows>
        {top[0] && count(top[0]) > 0 && (
          <StatRow label="Largest group" value={`${top[0].name} · ${count(top[0])}`} href={`/links/${top[0].slug}`} />
        )}
        <StatRow
          label="Average per group"
          value={groups.length ? (Math.round((totalLinks / groups.length) * 10) / 10).toString() : "—"}
        />
        {empty > 0 && <StatRow label="Empty groups" value={empty} />}
        {rest.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
            {rest.map((g) => (
              <Link key={g._id} href={`/links/${g.slug}`} className="hover:underline">
                {g.name}
              </Link>
            ))}
          </div>
        )}
      </StatRows>
    </ModuleCard>
  );
}
