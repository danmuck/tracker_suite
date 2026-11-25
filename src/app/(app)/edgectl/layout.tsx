import { MirageGate } from "@/components/edgectl/mirage-gate";

// Every edgectl page needs Mirage: when it cannot be reached the gate says why instead.
export default function EdgectlLayout({ children }: { children: React.ReactNode }) {
  return <MirageGate>{children}</MirageGate>;
}
