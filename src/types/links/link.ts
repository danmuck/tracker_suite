export interface LinkItem {
  _id: string;
  groupId: string;
  name: string;
  url: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface LinkFormData {
  groupId: string;
  name: string;
  url: string;
}
