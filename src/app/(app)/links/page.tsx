"use client";

import { useState } from "react";
import { Link2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { GroupForm } from "@/components/links/group-form";
import { GroupCard } from "@/components/links/group-card";
import {
  useLinkGroups,
  createLinkGroup,
  updateLinkGroup,
  deleteLinkGroup,
} from "@/hooks/links/use-link-groups";
import type { LinkGroup, LinkGroupFormData } from "@/types/links/link-group";

export default function LinksPage() {
  const { groups, isLoading, mutate } = useLinkGroups();
  const [formOpen, setFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<LinkGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<LinkGroup | null>(null);

  async function handleCreate(data: LinkGroupFormData) {
    await createLinkGroup(data);
    mutate();
    setFormOpen(false);
  }

  async function handleUpdate(data: LinkGroupFormData) {
    if (!editingGroup) return;
    await updateLinkGroup(editingGroup._id, data);
    mutate();
    setEditingGroup(null);
  }

  async function handleDelete() {
    if (!deletingGroup) return;
    await deleteLinkGroup(deletingGroup._id);
    mutate();
    setDeletingGroup(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Links"
        description="Organize your bookmarks into groups"
        action={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Group
          </Button>
        }
      />

      {isLoading ? (
        <LoadingState variant="cards" />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="No link groups yet"
          description="Create your first group to start organizing links."
          action={{ label: "New Group", onClick: () => setFormOpen(true) }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <GroupCard
              key={group._id}
              group={group}
              onEdit={setEditingGroup}
              onDelete={setDeletingGroup}
            />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Group</DialogTitle>
          </DialogHeader>
          <GroupForm
            onSubmit={handleCreate}
            onCancel={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={!!editingGroup}
        onOpenChange={(open) => !open && setEditingGroup(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Group</DialogTitle>
          </DialogHeader>
          {editingGroup && (
            <GroupForm
              defaultValues={editingGroup}
              onSubmit={handleUpdate}
              onCancel={() => setEditingGroup(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <DeleteConfirmDialog
        open={!!deletingGroup}
        onOpenChange={(open) => !open && setDeletingGroup(null)}
        onConfirm={handleDelete}
        title="Delete group"
        description="This will permanently delete this group and all its links. This action cannot be undone."
      />
    </div>
  );
}
