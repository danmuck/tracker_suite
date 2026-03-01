import { z } from "zod";

export const linkGroupSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  icon: z.string().max(50).optional(),
});

export const linkSchema = z.object({
  groupId: z.string().min(1, "Group is required"),
  name: z.string().min(1, "Name is required").max(200),
  url: z.string().url("Must be a valid URL"),
});

export type LinkGroupInput = z.infer<typeof linkGroupSchema>;
export type LinkInput = z.infer<typeof linkSchema>;
