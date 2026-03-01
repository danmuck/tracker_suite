export type ProjectStatus = "active" | "archived" | "completed";

export interface Project {
  _id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  repositoryUrl?: string;
  color: string;
  taskCounts?: {
    total: number;
    done: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFormData {
  name: string;
  description?: string;
  status: ProjectStatus;
  repositoryUrl?: string;
  color: string;
}
