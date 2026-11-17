"use client";

import { Database } from "lucide-react";
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
import { IS_DEMO, setDataSource, useDataSource } from "@/lib/data/mode";

async function loadSample() {
  if (!window.confirm("Replace browser data with the sample set?")) return;
  await loadSampleData(getBrowserStore());
  window.location.reload();
}

function resetBrowserData() {
  if (!window.confirm("Delete all browser data?")) return;
  getBrowserStore().clear();
  try {
    window.localStorage.removeItem(SEEDED_KEY);
  } catch {
    // storage unavailable; nothing to clear
  }
  window.location.reload();
}

export function DataSourceSwitch() {
  const source = useDataSource();
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
