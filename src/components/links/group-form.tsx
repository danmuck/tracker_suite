"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LINK_GROUP_ICONS } from "@/lib/links/constants";
import { getIcon } from "@/lib/icon-map";
import type { LinkGroupFormData } from "@/types/links/link-group";

interface GroupFormProps {
  defaultValues?: Partial<LinkGroupFormData>;
  onSubmit: (data: LinkGroupFormData) => Promise<void>;
  onCancel?: () => void;
}

export function GroupForm({ defaultValues, onSubmit, onCancel }: GroupFormProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [icon, setIcon] = useState(defaultValues?.icon ?? "Globe");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required";
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
        icon,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="name">Group Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Homelab"
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      <div className="space-y-1">
        <Label>Icon</Label>
        <div className="flex gap-2 flex-wrap">
          {LINK_GROUP_ICONS.map((iconName) => {
            const Icon = getIcon(iconName);
            return (
              <button
                key={iconName}
                type="button"
                className={`flex h-9 w-9 items-center justify-center rounded-md border-2 transition-colors ${
                  icon === iconName
                    ? "border-primary bg-primary/10"
                    : "border-transparent hover:bg-muted"
                }`}
                onClick={() => setIcon(iconName)}
                title={iconName}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
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
