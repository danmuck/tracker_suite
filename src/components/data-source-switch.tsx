"use client";

import { Database } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { loadSampleData, SEEDED_KEY } from "@/lib/demo";
import { getBrowserStore } from "@/lib/data/local";
import { IS_DEMO, setDataSource, useResolvedDataSource } from "@/lib/data/mode";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : undefined);

async function loadSample() {
  if (!window.confirm("Replace browser data with the sample set?")) return;
  try {
    await loadSampleData(getBrowserStore());
  } catch (error) {
    toast.error("Could not load sample data", { description: errorMessage(error) });
    return;
  }
  window.location.reload();
}

function resetBrowserData() {
  if (!window.confirm("Delete all browser data?")) return;
  try {
    getBrowserStore().clear();
    // Deliberate second guard: clear() already removes the key, but a reset must always reseed in the demo.
    window.localStorage.removeItem(SEEDED_KEY);
  } catch (error) {
    toast.error("Could not reset browser data", { description: errorMessage(error) });
    return;
  }
  window.location.reload();
}

export function DataSourceSwitch() {
  const source = useResolvedDataSource();
  // Until the saved source is known, show the button without a badge or menu (same on server and first client render).
  if (source === null) {
    return (
      <Button variant="ghost" size="sm" aria-label="Data source" className="gap-2 px-2" disabled>
        <Database className="h-4 w-4" />
      </Button>
    );
  }
  const inBrowser = source === "browser";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Data source" className="gap-2 px-2">
          <Database className="h-4 w-4" />
          {inBrowser && <Badge variant="secondary">Browser data</Badge>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {IS_DEMO ? (
          <DropdownMenuLabel className="font-normal text-muted-foreground">
            Demo: data is stored in this browser
          </DropdownMenuLabel>
        ) : (
          <>
            <DropdownMenuCheckboxItem
              checked={!inBrowser}
              onSelect={() => setDataSource("server")}
            >
              My data
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={inBrowser}
              onSelect={() => setDataSource("browser")}
            >
              Browser data
            </DropdownMenuCheckboxItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!inBrowser} onSelect={() => void loadSample()}>
          Load sample data
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!inBrowser} onSelect={resetBrowserData}>
          Reset browser data
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
