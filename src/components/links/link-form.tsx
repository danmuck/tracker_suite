"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFaviconUrl } from "@/lib/links/favicon";
import type { LinkFormData } from "@/types/links/link";

interface LinkFormProps {
  groupId: string;
  defaultValues?: Partial<LinkFormData>;
  onSubmit: (data: LinkFormData) => Promise<void>;
  onCancel?: () => void;
}

export function LinkForm({ groupId, defaultValues, onSubmit, onCancel }: LinkFormProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [url, setUrl] = useState(defaultValues?.url ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isValidUrl = (() => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  })();

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required";
    if (!url.trim()) errs.url = "URL is required";
    else if (!isValidUrl) errs.url = "Must be a valid URL";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await onSubmit({
        groupId,
        name: name.trim(),
        url: url.trim(),
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="name">Link Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Proxmox Dashboard"
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="url">URL</Label>
        <div className="flex items-center gap-2">
          {isValidUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={getFaviconUrl(url)}
              alt=""
              className="h-5 w-5 shrink-0"
            />
          )}
          <Input
            id="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="flex-1"
          />
        </div>
        {errors.url && <p className="text-xs text-destructive">{errors.url}</p>}
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
