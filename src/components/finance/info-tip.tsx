import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Small info icon that explains the figure it sits beside on hover or focus */
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`About ${label}`}
          className="text-muted-foreground/60 transition-colors hover:text-foreground"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-60 text-pretty">{children}</TooltipContent>
    </Tooltip>
  );
}
