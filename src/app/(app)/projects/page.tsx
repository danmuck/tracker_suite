"use client";

import { useState } from "react";
import { FolderKanban, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { ProjectForm } from "@/components/projects/project-form";
import { ProjectCard } from "@/components/projects/project-card";
import {
  useProjects,
  createProject,
  updateProject,
  deleteProject,
} from "@/hooks/projects/use-projects";
import type { Project, ProjectFormData } from "@/types/projects/project";

export default function ProjectsPage() {
  const { projects, isLoading, mutate } = useProjects();
  const [formOpen, setFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [tab, setTab] = useState("all");

  const filtered =
    tab === "all" ? projects : projects.filter((p) => p.status === tab);

  async function handleCreate(data: ProjectFormData) {
    await createProject(data);
    mutate();
    setFormOpen(false);
  }

  async function handleUpdate(data: ProjectFormData) {
    if (!editingProject) return;
    await updateProject(editingProject._id, data);
    mutate();
    setEditingProject(null);
  }

  async function handleDelete() {
    if (!deletingProject) return;
    await deleteProject(deletingProject._id);
    mutate();
    setDeletingProject(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Manage your projects and tasks"
        action={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        }
      />

      {isLoading ? (
        <LoadingState variant="cards" />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Create your first project to start managing tasks."
          action={{ label: "New Project", onClick: () => setFormOpen(true) }}
        />
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all">All ({projects.length})</TabsTrigger>
            <TabsTrigger value="active">
              Active ({projects.filter((p) => p.status === "active").length})
            </TabsTrigger>
            <TabsTrigger value="completed">
              Completed ({projects.filter((p) => p.status === "completed").length})
            </TabsTrigger>
            <TabsTrigger value="archived">
              Archived ({projects.filter((p) => p.status === "archived").length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((project) => (
                <ProjectCard
                  key={project._id}
                  project={project}
                  onEdit={setEditingProject}
                  onDelete={setDeletingProject}
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* Create dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
          </DialogHeader>
          <ProjectForm
            onSubmit={handleCreate}
            onCancel={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={!!editingProject}
        onOpenChange={(open) => !open && setEditingProject(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>
          {editingProject && (
            <ProjectForm
              defaultValues={editingProject}
              onSubmit={handleUpdate}
              onCancel={() => setEditingProject(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <DeleteConfirmDialog
        open={!!deletingProject}
        onOpenChange={(open) => !open && setDeletingProject(null)}
        onConfirm={handleDelete}
        title="Delete project"
        description="This will permanently delete this project, all its tasks, and notes. This action cannot be undone."
      />
    </div>
  );
}
