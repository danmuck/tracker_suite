"use client";

import { ServerCrash, Settings, Unplug, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { useMirage } from "@/hooks/edgectl/use-mirage";

function Problem({ icon, title, description, detail }: { icon: LucideIcon; title: string; description: string; detail?: string }) {
  return (
    <div role="status">
      <EmptyState icon={icon} title={title} description={description} />
      {detail && (
        <p className="mx-auto -mt-10 max-w-xl pb-16 text-center font-mono text-xs break-words text-muted-foreground">
          {detail}
        </p>
      )}
    </div>
  );
}

/**
 * Shows its children only while this app's server can reach Mirage; otherwise says why not.
 * The status check repeats every few seconds, so the page comes back on its own.
 */
export function MirageGate({ children }: { children: React.ReactNode }) {
  const { connection, isLoading } = useMirage();

  if (!connection) {
    if (isLoading) return <LoadingState />;
    return (
      <Problem
        icon={ServerCrash}
        title="Could not check Mirage"
        description="This app's server did not answer. Reload the page to try again."
      />
    );
  }

  switch (connection.state) {
    case "ok":
      return <>{children}</>;
    case "not_configured":
      return (
        <Problem
          icon={Settings}
          title="edgectl is not configured"
          description="Set EDGECTL_API_URL, EDGECTL_CLIENT_CERT, EDGECTL_CLIENT_KEY and EDGECTL_CA for this app's server, then restart it."
          detail={connection.message}
        />
      );
    case "unreachable":
      return (
        <Problem
          icon={Unplug}
          title="Mirage unreachable"
          description="Mirage is not answering. Start it (for a lab: make lab in the edgectl repo). This page checks again every few seconds."
          detail={connection.message}
        />
      );
    default:
      return (
        <Problem
          icon={ServerCrash}
          title="Mirage answered with an error"
          description="The status request was refused or failed."
          detail={connection.message}
        />
      );
  }
}
