"use client";

import Link from "next/link";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getIcon } from "@/lib/icon-map";
import type { LinkGroup } from "@/types/links/link-group";

interface GroupCardProps {
  group: LinkGroup;
  onEdit: (group: LinkGroup) => void;
  onDelete: (group: LinkGroup) => void;
}

export function GroupCard({ group, onEdit, onDelete }: GroupCardProps) {
  const Icon = group.icon ? getIcon(group.icon) : getIcon("Link2");

  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <Link href={`/links/${group.slug}`} className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
              <Icon className="h-4 w-4" />
            </div>
            <CardTitle className="text-base truncate hover:underline">
              {group.name}
            </CardTitle>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(group)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(group)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {group.linkCount ?? 0} link{(group.linkCount ?? 0) !== 1 ? "s" : ""}
        </p>
      </CardContent>
    </Card>
  );
}
