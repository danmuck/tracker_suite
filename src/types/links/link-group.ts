export interface LinkGroup {
  _id: string;
  name: string;
  slug: string;
  icon?: string;
  order: number;
  linkCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface LinkGroupFormData {
  name: string;
  icon?: string;
}
