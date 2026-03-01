import { z } from "zod";

export const projectSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  status: z.enum(["active", "archived", "completed"]).default("active"),
  repositoryUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color").default("#3b82f6"),
});

export const taskSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(2000).optional(),
  status: z.enum(["backlog", "todo", "in_progress", "in_review", "done"]).default("todo"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  dueDate: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export const taskReorderSchema = z.object({
  status: z.enum(["backlog", "todo", "in_progress", "in_review", "done"]),
  order: z.number().int().min(0),
});

export const scratchpadSchema = z.object({
  content: z.string().max(50000).default(""),
});

export type ProjectInput = z.infer<typeof projectSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type TaskReorderInput = z.infer<typeof taskReorderSchema>;
export type ScratchpadInput = z.infer<typeof scratchpadSchema>;
