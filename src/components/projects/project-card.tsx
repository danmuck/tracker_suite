"use client";

import Link from "next/link";
import { ExternalLink, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PROJECT_STATUS_LABELS } from "@/lib/projects/constants";
import type { Project } from "@/types/projects/project";

interface ProjectCardProps {
  project: Project;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
}

export function ProjectCard({ project, onEdit, onDelete }: ProjectCardProps) {
  const progress =
    project.taskCounts && project.taskCounts.total > 0
      ? Math.round((project.taskCounts.done / project.taskCounts.total) * 100)
      : 0;

  return (
    <Card className="relative overflow-hidden">
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: project.color }}
      />
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <Link href={`/projects/${project._id}`} className="flex-1 min-w-0">
            <CardTitle className="text-base truncate hover:underline">
              {project.name}
            </CardTitle>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(project)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(project)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {project.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {project.description}
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary">{PROJECT_STATUS_LABELS[project.status]}</Badge>
          {project.repositoryUrl && (
            <a
              href={project.repositoryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
              Repo
            </a>
          )}
        </div>

        {project.taskCounts && project.taskCounts.total > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {project.taskCounts.done}/{project.taskCounts.total} tasks
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
