"use client";

import { Badge } from "@/components/ui/badge";
import { TASK_PRIORITY_LABELS, TASK_PRIORITY_COLORS } from "@/lib/projects/constants";
import type { TaskPriority } from "@/types/projects/task";

interface PriorityBadgeProps {
  priority: TaskPriority;
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <Badge variant="outline" className={`text-xs ${TASK_PRIORITY_COLORS[priority]}`}>
      {TASK_PRIORITY_LABELS[priority]}
    </Badge>
  );
}
