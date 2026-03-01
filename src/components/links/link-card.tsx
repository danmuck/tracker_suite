"use client";

import { ExternalLink, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getFaviconUrl } from "@/lib/links/favicon";
import type { LinkItem } from "@/types/links/link";

interface LinkCardProps {
  link: LinkItem;
  onEdit: (link: LinkItem) => void;
  onDelete: (link: LinkItem) => void;
}

export function LinkCard({ link, onEdit, onDelete }: LinkCardProps) {
  let displayUrl = "";
  try {
    const u = new URL(link.url);
    displayUrl = u.hostname + (u.pathname !== "/" ? u.pathname : "");
  } catch {
    displayUrl = link.url;
  }

  return (
    <Card className="relative overflow-hidden">
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 flex-1 min-w-0 group"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getFaviconUrl(link.url)}
              alt=""
              className="h-6 w-6 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate group-hover:underline">
                {link.name}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {displayUrl}
              </p>
            </div>
            <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(link)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(link)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
