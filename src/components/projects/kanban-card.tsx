"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Calendar, GripVertical, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PriorityBadge } from "@/components/projects/priority-badge";
import { TASK_PRIORITY_COLORS } from "@/lib/projects/constants";
import type { Task } from "@/types/projects/task";

interface KanbanCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function KanbanCard({ task, onEdit, onDelete }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task._id, data: { task } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const priorityBorderColor: Record<string, string> = {
    low: "border-l-muted-foreground/30",
    medium: "border-l-blue-500/50",
    high: "border-l-orange-500/50",
    urgent: "border-l-red-500/50",
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`border-l-2 ${priorityBorderColor[task.priority]} group cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-50 shadow-lg" : "hover:shadow-md"
      } transition-shadow`}
    >
      <div className="p-3 space-y-2">
        <div className="flex items-start gap-1">
          <button
            className="mt-0.5 text-muted-foreground/50 hover:text-muted-foreground shrink-0"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <p className="text-sm font-medium flex-1 min-w-0">{task.title}</p>
          <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 shrink-0 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onEdit(task)}
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive"
              onClick={() => onDelete(task)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <PriorityBadge priority={task.priority} />
          {task.dueDate && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {format(new Date(task.dueDate), "MMM d")}
            </span>
          )}
        </div>

        {task.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {task.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
