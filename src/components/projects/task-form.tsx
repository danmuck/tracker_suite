"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS } from "@/lib/projects/constants";
import type { TaskFormData, TaskStatus, TaskPriority } from "@/types/projects/task";

interface TaskFormProps {
  projectId: string;
  defaultValues?: Partial<TaskFormData>;
  onSubmit: (data: TaskFormData) => Promise<void>;
  onCancel?: () => void;
}

export function TaskForm({ projectId, defaultValues, onSubmit, onCancel }: TaskFormProps) {
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState(defaultValues?.title ?? "");
  const [description, setDescription] = useState(defaultValues?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(defaultValues?.status ?? "todo");
  const [priority, setPriority] = useState<TaskPriority>(defaultValues?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(defaultValues?.dueDate ?? "");
  const [tags, setTags] = useState<string[]>(defaultValues?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "Title is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function addTag() {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await onSubmit({
        projectId,
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        dueDate: dueDate || undefined,
        tags,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Implement auth flow"
        />
        {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional task description..."
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="status">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="priority">Priority</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
            <SelectTrigger id="priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="dueDate">Due Date</Label>
        <Input
          id="dueDate"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="tags">Tags</Label>
        <div className="flex gap-2">
          <Input
            id="tags"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="Add a tag..."
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={addTag}>
            Add
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-1">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1">
                {tag}
                <button type="button" onClick={() => removeTag(tag)}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </div>
    </form>
  );
}
