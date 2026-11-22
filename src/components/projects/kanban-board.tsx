"use client";

import { useCallback, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { useState } from "react";
import { KanbanColumn } from "@/components/projects/kanban-column";
import { KanbanCard } from "@/components/projects/kanban-card";
import { TASK_STATUSES } from "@/lib/projects/constants";
import type { Task, TaskStatus } from "@/types/projects/task";

interface KanbanBoardProps {
  tasks: Task[];
  onAddTask: (status: TaskStatus) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onReorderTask: (taskId: string, newStatus: TaskStatus, newOrder: number) => void;
}

export function KanbanBoard({
  tasks,
  onAddTask,
  onEditTask,
  onDeleteTask,
  onReorderTask,
}: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const tasksByStatus = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const status of TASK_STATUSES) {
      map[status] = tasks
        .filter((t) => t.status === status)
        .sort((a, b) => a.order - b.order);
    }
    return map;
  }, [tasks]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const task = tasks.find((t) => t._id === event.active.id);
      if (task) setActiveTask(task);
    },
    [tasks]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveTask(null);
      const { active, over } = event;
      if (!over) return;

      const activeId = active.id as string;
      const task = tasks.find((t) => t._id === activeId);
      if (!task) return;

      // Determine target column: either a column droppable or another task's column
      let targetStatus: TaskStatus;
      let targetOrder: number;

      const overTask = tasks.find((t) => t._id === over.id);
      if (overTask) {
        targetStatus = overTask.status;
        targetOrder = overTask.order;
        // If dropping after the current position in same column, keep same order
        if (task.status === targetStatus && task.order === targetOrder) return;
      } else {
        // Dropped on a column droppable
        targetStatus = over.id as TaskStatus;
        targetOrder = tasksByStatus[targetStatus]?.length ?? 0;
        // If same column and already at end, no-op
        if (task.status === targetStatus && task.order === targetOrder) return;
      }

      onReorderTask(activeId, targetStatus, targetOrder);
    },
    [tasks, tasksByStatus, onReorderTask]
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {TASK_STATUSES.map((status) => (
          <KanbanColumn
            key={status}
            status={status as TaskStatus}
            tasks={tasksByStatus[status] || []}
            onAddTask={onAddTask}
            onEditTask={onEditTask}
            onDeleteTask={onDeleteTask}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="w-[244px]">
            <KanbanCard
              task={activeTask}
              onEdit={() => {}}
              onDelete={() => {}}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
