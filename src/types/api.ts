export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  error: string;
  details?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface TransactionFilters {
  accountId?: string;
  startDate?: string;
  endDate?: string;
  type?: "credit" | "debit" | "transfer";
  category?: string;
  isRecurring?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sort?: string;
  order?: "asc" | "desc";
}
