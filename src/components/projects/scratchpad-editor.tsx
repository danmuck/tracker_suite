"use client";

import { useState, useCallback, useRef } from "react";
import Markdown from "react-markdown";
import { toast } from "sonner";
import { Eye, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useScratchpad, updateScratchpad } from "@/hooks/projects/use-scratchpad";
import { LoadingState } from "@/components/loading-state";
import { requestSave, saveFailed, saveSucceeded, startSync, type ScratchpadSync } from "@/lib/projects/scratchpad-sync";

interface ScratchpadEditorProps {
  projectId: string;
}

export function ScratchpadEditor({ projectId }: ScratchpadEditorProps) {
  const { scratchpad, isLoading, isError, mutate } = useScratchpad(projectId);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [content, setContent] = useState("");
  const [initialized, setInitialized] = useState(false);
  // The content the editor was initialised from: what the server holds until the first save.
  const [loaded, setLoaded] = useState("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What was requested and which answers may be applied (see scratchpad-sync.ts); set on first save.
  const sync = useRef<ScratchpadSync | null>(null);
  // One PUT at a time, in the order requested, so the server applies them in that order too.
  const queue = useRef<Promise<void>>(Promise.resolve());

  // Initialize content from scratchpad data, once (adjusting state while rendering, not in an effect)
  if (scratchpad && !initialized) {
    setContent(scratchpad.content);
    setLoaded(scratchpad.content);
    setInitialized(true);
  }

  const save = useCallback(
    (value: string) => {
      const requested = requestSave(sync.current ?? startSync(loaded), value);
      sync.current = requested.state;
      const { save: next } = requested;
      if (!next) return; // nothing new: an untouched editor never writes
      queue.current = queue.current.then(async () => {
        try {
          const saved = await updateScratchpad(projectId, next.value);
          const done = saveSucceeded(sync.current!, next.seq);
          sync.current = done.state;
          // Write the saved document into the cache, even after this editor unmounted (a tab or
          // page change): the next mount starts from it, not from an older cached version.
          if (done.apply) mutate(saved, { revalidate: false });
        } catch (err) {
          sync.current = saveFailed(sync.current!, next.seq);
          // The typed text stays in the editor; the next change or blur tries again.
          toast.error(err instanceof Error && err.message ? `Notes not saved: ${err.message}` : "Notes not saved");
        }
      });
    },
    [projectId, mutate, loaded]
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
  // No editor without the saved notes: typing here would auto-save over them.
  if (isError && !initialized) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Could not load the notes. Reload the page to try again.
      </p>
    );
  }

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
