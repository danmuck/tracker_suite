"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROJECT_STATUS_LABELS, DEFAULT_PROJECT_COLORS } from "@/lib/projects/constants";
import type { ProjectFormData, ProjectStatus } from "@/types/projects/project";

interface ProjectFormProps {
  defaultValues?: Partial<ProjectFormData>;
  onSubmit: (data: ProjectFormData) => Promise<void>;
  onCancel?: () => void;
}

export function ProjectForm({ defaultValues, onSubmit, onCancel }: ProjectFormProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [description, setDescription] = useState(defaultValues?.description ?? "");
  const [status, setStatus] = useState<ProjectStatus>(defaultValues?.status ?? "active");
  const [repositoryUrl, setRepositoryUrl] = useState(defaultValues?.repositoryUrl ?? "");
  const [color, setColor] = useState(defaultValues?.color ?? DEFAULT_PROJECT_COLORS[0]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required";
    if (repositoryUrl && !/^https?:\/\/.+/.test(repositoryUrl)) {
      errs.repositoryUrl = "Must be a valid URL";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        status,
        repositoryUrl: repositoryUrl.trim() || undefined,
        color,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="name">Project Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Tracker Suite"
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional project description..."
          rows={3}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="status">Status</Label>
        <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
          <SelectTrigger id="status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="repositoryUrl">Repository URL</Label>
        <Input
          id="repositoryUrl"
          value={repositoryUrl}
          onChange={(e) => setRepositoryUrl(e.target.value)}
          placeholder="https://github.com/user/repo"
        />
        {errors.repositoryUrl && (
          <p className="text-xs text-destructive">{errors.repositoryUrl}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label>Color</Label>
        <div className="flex gap-2 flex-wrap">
          {DEFAULT_PROJECT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`h-8 w-8 rounded-full border-2 transition-transform ${
                color === c ? "border-foreground scale-110" : "border-transparent"
              }`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
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
