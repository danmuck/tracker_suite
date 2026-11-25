import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StateBadge } from "@/components/edgectl/state-badge";
import { formatTime } from "@/lib/edgectl/format";
import { intentHref } from "@/lib/edgectl/paths";
import type { Report } from "@/types/edgectl/api";

/** Newest first; reports with the same time keep Mirage's order, latest on top */
export function newestFirst(reports: Report[]): Report[] {
  return reports
    .map((report, index) => ({ report, index }))
    .sort((a, b) => b.report.timestamp_ms - a.report.timestamp_ms || b.index - a.index)
    .map(({ report }) => report);
}

/** `report`s in the order given. Mirage repeats a report when an intent is reconciled again. */
export function ReportsTable({ reports, showIntent = true }: { reports: Report[]; showIntent?: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          {showIntent && <TableHead>Intent</TableHead>}
          <TableHead>Summary</TableHead>
          <TableHead>Completion</TableHead>
          <TableHead>Outcome</TableHead>
          <TableHead>Command</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reports.map((report, i) => (
          <TableRow key={`${report.intent_id}:${report.command_id ?? ""}:${report.timestamp_ms}:${i}`}>
            <TableCell className="whitespace-nowrap tabular-nums">{formatTime(report.timestamp_ms)}</TableCell>
            {showIntent && (
              <TableCell className="font-mono text-xs">
                <Link href={intentHref(report.intent_id)} className="hover:underline">
                  {report.intent_id}
                </Link>
              </TableCell>
            )}
            <TableCell className="whitespace-normal">{report.summary}</TableCell>
            <TableCell>
              <StateBadge state={report.completion_state} empty="—" />
            </TableCell>
            <TableCell>{report.outcome ? <StateBadge state={report.outcome} /> : "—"}</TableCell>
            <TableCell className="font-mono text-xs">{report.command_id || "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
