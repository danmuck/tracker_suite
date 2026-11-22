export type TaskStatus = "backlog" | "todo" | "in_progress" | "in_review" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface Task {
  _id: string;
  projectId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  order: number;
  dueDate?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskFormData {
  projectId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  tags: string[];
}
