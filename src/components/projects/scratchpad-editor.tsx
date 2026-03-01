"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Markdown from "react-markdown";
import { Eye, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useScratchpad, updateScratchpad } from "@/hooks/projects/use-scratchpad";
import { LoadingState } from "@/components/loading-state";

interface ScratchpadEditorProps {
  projectId: string;
}

export function ScratchpadEditor({ projectId }: ScratchpadEditorProps) {
  const { scratchpad, isLoading, mutate } = useScratchpad(projectId);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [content, setContent] = useState("");
  const [initialized, setInitialized] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize content from scratchpad data
  useEffect(() => {
    if (scratchpad && !initialized) {
      setContent(scratchpad.content);
      setInitialized(true);
    }
  }, [scratchpad, initialized]);

  const save = useCallback(
    async (value: string) => {
      try {
        await updateScratchpad(projectId, value);
        mutate();
      } catch {
        // silent fail for auto-save
      }
    },
    [projectId, mutate]
  );

  const handleChange = useCallback(
    (value: string) => {
      setContent(value);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => save(value), 1000);
    },
    [save]
  );

  const handleBlur = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    save(content);
  }, [content, save]);

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          variant={mode === "edit" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("edit")}
        >
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Edit
        </Button>
        <Button
          variant={mode === "preview" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("preview")}
        >
          <Eye className="mr-1.5 h-3.5 w-3.5" />
          Preview
        </Button>
      </div>

      {mode === "edit" ? (
        <Textarea
          value={content}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          placeholder="Write your notes here... (Markdown supported)"
          className="min-h-[400px] font-mono text-sm"
          rows={20}
        />
      ) : (
        <div className="prose prose-sm dark:prose-invert max-w-none min-h-[400px] rounded-md border p-4">
          {content ? (
            <Markdown>{content}</Markdown>
          ) : (
            <p className="text-muted-foreground italic">No notes yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
