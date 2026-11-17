"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const themes = ["system", "light", "dark"] as const;
type Theme = (typeof themes)[number];

const themeIcons: Record<Theme, React.ReactNode> = {
  system: <Monitor className="h-4 w-4" />,
  light: <Sun className="h-4 w-4" />,
  dark: <Moon className="h-4 w-4" />,
};

const themeLabels: Record<Theme, string> = {
  system: "System theme",
  light: "Light theme",
  dark: "Dark theme",
};

const noopSubscribe = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // The saved theme is only known in the browser. Until hydration is done, render the
  // same "system" icon the server sent, so the two renders match.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  function cycleTheme() {
    const current = (theme as Theme) ?? "system";
    const idx = themes.indexOf(current);
    const next = themes[(idx + 1) % themes.length];
    setTheme(next);
  }

  const current = hydrated ? ((theme as Theme) ?? "system") : "system";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={cycleTheme}>
          {themeIcons[current]}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{themeLabels[current]}</TooltipContent>
    </Tooltip>
  );
}
