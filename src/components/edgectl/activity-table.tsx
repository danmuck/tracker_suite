import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StateBadge } from "@/components/edgectl/state-badge";
import { formatTime } from "@/lib/edgectl/format";
import type { ActivityRecord } from "@/types/edgectl/api";

// Shown in their own columns; every other field goes under Details.
const AUDIT_COLUMNS = ["component", "action", "decision", "principal"];
const CUSTODY_COLUMNS = ["component", "intent_id", "command_id"];
// Repeats the record's own time.
const HIDDEN = new Set(["timestamp_ms"]);

/** Newest first; records with the same time keep Mirage's order, latest on top */
export function newestRecordsFirst(records: ActivityRecord[]): ActivityRecord[] {
  return records
    .map((record, index) => ({ record, index }))
    .sort((a, b) => b.record.timestamp_ms - a.record.timestamp_ms || b.index - a.index)
    .map(({ record }) => record);
}

const LABELS: Record<string, string> = {
  component: "Component",
  action: "Action",
  decision: "Decision",
  principal: "Principal",
  intent_id: "Intent",
  command_id: "Command",
};

/** Mirage's audit or custody records, with the logged fields as they are */
export function ActivityTable({ records, kind }: { records: ActivityRecord[]; kind: "audit" | "custody" }) {
  const columns = kind === "audit" ? AUDIT_COLUMNS : CUSTODY_COLUMNS;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          {columns.map((column) => (
            <TableHead key={column}>{LABELS[column]}</TableHead>
          ))}
          <TableHead>Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.map((record, i) => {
          const rest = Object.entries(record.fields).filter(
            ([key, value]) => !columns.includes(key) && !HIDDEN.has(key) && value !== "",
          );
          return (
            <TableRow key={i}>
              <TableCell className="whitespace-nowrap tabular-nums">{formatTime(record.timestamp_ms)}</TableCell>
              {columns.map((column) => (
                <TableCell key={column} className="font-mono text-xs break-all whitespace-normal">
                  {column === "decision" && record.fields.decision ? (
                    <StateBadge state={record.fields.decision} />
                  ) : (
                    record.fields[column] || "—"
                  )}
                </TableCell>
              ))}
              <TableCell className="whitespace-normal">
                <dl className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-xs">
                  {rest.map(([key, value]) => (
                    <div key={key} className="flex gap-1">
                      <dt className="text-muted-foreground">{key}</dt>
                      <dd className="break-all">{value}</dd>
                    </div>
                  ))}
                </dl>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
