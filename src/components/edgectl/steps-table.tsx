import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { InstallStep } from "@/types/edgectl/api";

/** Where a step installs from, in one line */
function sourceOf(step: InstallStep): string {
  if (step.package) return step.tap ? `${step.tap}/${step.package}` : step.package;
  if (step.url) return `${step.url}${step.version ? ` (${step.version})` : ""}`;
  if (step.repo_url) return `${step.repo_url}${step.ref ? ` @ ${step.ref}` : ""}`;
  return "—";
}

/** Install steps as Mirage (or edgecert) derived them from the dependency catalog */
export function StepsTable({ steps }: { steps: InstallStep[] }) {
  if (steps.length === 0) return <p className="text-sm text-muted-foreground">No install steps.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Seed</TableHead>
          <TableHead>Method</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Binary</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {steps.map((step, i) => (
          <TableRow key={i}>
            <TableCell className="font-mono text-xs">{step.seed_id}</TableCell>
            <TableCell className="font-mono text-xs">{step.method}</TableCell>
            <TableCell className="font-mono text-xs break-all whitespace-normal">
              {sourceOf(step)}
              {step.sha256 && <span className="block text-muted-foreground">sha256 {step.sha256}</span>}
            </TableCell>
            <TableCell className="font-mono text-xs">{step.binary || "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
