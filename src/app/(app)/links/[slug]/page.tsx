"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
import { LinkForm } from "@/components/links/link-form";
import { LinkCard } from "@/components/links/link-card";
import { useLinkGroups } from "@/hooks/links/use-link-groups";
import {
  useLinks,
  createLink,
  updateLink,
  deleteLink,
} from "@/hooks/links/use-links";
import type { LinkItem, LinkFormData } from "@/types/links/link";

export default function LinkGroupPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { groups, isLoading: groupsLoading } = useLinkGroups();

  const group = groups.find((g) => g.slug === slug);
  const groupId = group?._id;

  const { links, isLoading: linksLoading, mutate } = useLinks(groupId);

  const [formOpen, setFormOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkItem | null>(null);
  const [deletingLink, setDeletingLink] = useState<LinkItem | null>(null);

  const isLoading = groupsLoading || (groupId ? linksLoading : false);

  // If groups loaded but no match, redirect
  if (!groupsLoading && groups.length > 0 && !group) {
    router.push("/links");
    return null;
  }

  async function handleCreate(data: LinkFormData) {
    await createLink(data);
    mutate();
    setFormOpen(false);
  }

  async function handleUpdate(data: LinkFormData) {
    if (!editingLink) return;
    await updateLink(editingLink._id, data);
    mutate();
    setEditingLink(null);
  }

  async function handleDelete() {
    if (!deletingLink) return;
    await deleteLink(deletingLink._id);
    mutate();
    setDeletingLink(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={group?.name ?? "Loading..."}
        description={`${links.length} link${links.length !== 1 ? "s" : ""}`}
        action={
          groupId ? (
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Link
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <LoadingState variant="cards" />
      ) : links.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="No links yet"
          description="Add your first link to this group."
          action={
            groupId
              ? { label: "Add Link", onClick: () => setFormOpen(true) }
              : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => (
            <LinkCard
              key={link._id}
              link={link}
              onEdit={setEditingLink}
              onDelete={setDeletingLink}
            />
          ))}
        </div>
      )}

      {/* Create dialog */}
      {groupId && (
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Link</DialogTitle>
            </DialogHeader>
            <LinkForm
              groupId={groupId}
              onSubmit={handleCreate}
              onCancel={() => setFormOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Edit dialog */}
      {groupId && (
        <Dialog
          open={!!editingLink}
          onOpenChange={(open) => !open && setEditingLink(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Link</DialogTitle>
            </DialogHeader>
            {editingLink && (
              <LinkForm
                groupId={groupId}
                defaultValues={editingLink}
                onSubmit={handleUpdate}
                onCancel={() => setEditingLink(null)}
              />
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Delete confirm dialog */}
      <DeleteConfirmDialog
        open={!!deletingLink}
        onOpenChange={(open) => !open && setDeletingLink(null)}
        onConfirm={handleDelete}
        title="Delete link"
        description="This will permanently delete this link. This action cannot be undone."
      />
    </div>
  );
}
