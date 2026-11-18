import { z } from "zod";
import { webUrl } from "@/lib/safe-url";

export const linkGroupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  icon: z.string().trim().max(50).optional(),
});

export const linkSchema = z.object({
  groupId: z.string().min(1, "Group is required"),
  name: z.string().trim().min(1, "Name is required").max(200),
  url: webUrl("Must be a valid URL"),
});

export type LinkGroupInput = z.infer<typeof linkGroupSchema>;
export type LinkInput = z.infer<typeof linkSchema>;
