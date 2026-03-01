"use client";

import { useState, useCallback } from "react";
import { use } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingState } from "@/components/loading-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { ProjectForm } from "@/components/projects/project-form";
import { TaskForm } from "@/components/projects/task-form";
import { KanbanBoard } from "@/components/projects/kanban-board";
import { ScratchpadEditor } from "@/components/projects/scratchpad-editor";
import { useProject, updateProject } from "@/hooks/projects/use-projects";
import {
  useTasks,
  createTask,
  updateTask,
  deleteTask,
  reorderTask,
} from "@/hooks/projects/use-tasks";
import type { ProjectFormData } from "@/types/projects/project";
import type { Task, TaskFormData, TaskStatus } from "@/types/projects/task";

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const { project, isLoading: projectLoading, mutate: mutateProject } = useProject(projectId);
  const { tasks, isLoading: tasksLoading, mutate: mutateTasks } = useTasks(projectId);

  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [taskFormDefaults, setTaskFormDefaults] = useState<Partial<TaskFormData>>({});
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);

  const handleAddTask = useCallback((status: TaskStatus) => {
    setTaskFormDefaults({ status });
    setEditingTask(null);
    setTaskFormOpen(true);
  }, []);

  const handleEditTask = useCallback((task: Task) => {
    setEditingTask(task);
    setTaskFormDefaults({
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate ? task.dueDate.split("T")[0] : undefined,
      tags: task.tags,
    });
    setTaskFormOpen(true);
  }, []);

  async function handleCreateTask(data: TaskFormData) {
    await createTask(data);
    mutateTasks();
    setTaskFormOpen(false);
  }

  async function handleUpdateTask(data: TaskFormData) {
    if (!editingTask) return;
    await updateTask(editingTask._id, data);
    mutateTasks();
    setTaskFormOpen(false);
    setEditingTask(null);
  }

  async function handleDeleteTask() {
    if (!deletingTask) return;
    await deleteTask(deletingTask._id);
    mutateTasks();
    setDeletingTask(null);
  }

  async function handleUpdateProject(data: ProjectFormData) {
    await updateProject(projectId, data);
    mutateProject();
    setEditProjectOpen(false);
  }

  const handleReorderTask = useCallback(
    async (taskId: string, newStatus: TaskStatus, newOrder: number) => {
      // Optimistic update
      const optimistic = tasks.map((t) => {
        if (t._id === taskId) return { ...t, status: newStatus, order: newOrder };
        return t;
      });
      mutateTasks(optimistic, false);

      try {
        await reorderTask(taskId, { status: newStatus, order: newOrder });
        mutateTasks();
      } catch {
        mutateTasks(); // revert on error
      }
    },
    [tasks, mutateTasks]
  );

  if (projectLoading || tasksLoading) return <LoadingState />;
  if (!project) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Project not found.</p>
        <Button variant="link" asChild className="mt-2">
          <Link href="/projects">Back to Projects</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" asChild className="shrink-0">
            <Link href="/projects">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: project.color }}
              />
              <h1 className="text-2xl font-bold tracking-tight truncate">
                {project.name}
              </h1>
            </div>
            {project.description && (
              <p className="text-muted-foreground text-sm mt-0.5 truncate">
                {project.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {project.repositoryUrl && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={project.repositoryUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Repo
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setEditProjectOpen(true)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Edit
          </Button>
        </div>
      </div>

      {/* Tabs: Board | Notes */}
      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="mt-4">
          <KanbanBoard
            tasks={tasks}
            onAddTask={handleAddTask}
            onEditTask={handleEditTask}
            onDeleteTask={setDeletingTask}
            onReorderTask={handleReorderTask}
          />
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <ScratchpadEditor projectId={projectId} />
        </TabsContent>
      </Tabs>

      {/* Edit project dialog */}
      <Dialog open={editProjectOpen} onOpenChange={setEditProjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>
          <ProjectForm
            defaultValues={project}
            onSubmit={handleUpdateProject}
            onCancel={() => setEditProjectOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Create/edit task dialog */}
      <Dialog
        open={taskFormOpen}
        onOpenChange={(open) => {
          if (!open) {
            setTaskFormOpen(false);
            setEditingTask(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTask ? "Edit Task" : "New Task"}</DialogTitle>
          </DialogHeader>
          <TaskForm
            projectId={projectId}
            defaultValues={taskFormDefaults}
            onSubmit={editingTask ? handleUpdateTask : handleCreateTask}
            onCancel={() => {
              setTaskFormOpen(false);
              setEditingTask(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete task confirm */}
      <DeleteConfirmDialog
        open={!!deletingTask}
        onOpenChange={(open) => !open && setDeletingTask(null)}
        onConfirm={handleDeleteTask}
        title="Delete task"
        description="This will permanently delete this task. This action cannot be undone."
      />
    </div>
  );
}
