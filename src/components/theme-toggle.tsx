"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";

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

const subscribe = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // The stored theme is only known in the browser; render the system icon
  // until hydration so server and client markup agree.
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

  const stored = themes.includes(theme as Theme) ? (theme as Theme) : "system";
  const current = hydrated ? stored : "system";
  const next = themes[(themes.indexOf(stored) + 1) % themes.length];

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next)}
      title={`${themeLabels[current]} — switch to ${next}`}
    >
      {themeIcons[current]}
      <span className="sr-only">
        {themeLabels[current]}. Switch to {next}.
      </span>
    </Button>
  );
}
