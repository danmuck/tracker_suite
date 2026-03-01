"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanCard } from "@/components/projects/kanban-card";
import { TASK_STATUS_LABELS, TASK_STATUS_COLORS } from "@/lib/projects/constants";
import type { Task, TaskStatus } from "@/types/projects/task";

interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Task[];
  onAddTask: (status: TaskStatus) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
}

export function KanbanColumn({
  status,
  tasks,
  onAddTask,
  onEditTask,
  onDeleteTask,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex flex-col min-w-[260px] w-[260px] shrink-0">
      <div
        className={`rounded-lg border border-t-2 ${TASK_STATUS_COLORS[status]} bg-muted/30 flex flex-col h-full`}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">{TASK_STATUS_LABELS[status]}</h3>
            <span className="text-xs text-muted-foreground bg-muted rounded-full px-1.5">
              {tasks.length}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onAddTask(status)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div
          ref={setNodeRef}
          className={`flex-1 p-2 space-y-2 overflow-y-auto min-h-[100px] transition-colors ${
            isOver ? "bg-accent/50" : ""
          }`}
        >
          <SortableContext
            items={tasks.map((t) => t._id)}
            strategy={verticalListSortingStrategy}
          >
            {tasks.map((task) => (
              <KanbanCard
                key={task._id}
                task={task}
                onEdit={onEditTask}
                onDelete={onDeleteTask}
              />
            ))}
          </SortableContext>
        </div>
      </div>
    </div>
  );
}
