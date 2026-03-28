// 事务类型先用稳定的业务 code 表达，后续路由层可以直接复用。
export type TaskCatalogTaskType =
  | "leave_application"
  | "expense_application"
  | "meeting_room_booking"
  | "permission_access";

export type TaskCatalogItem = {
  taskType: TaskCatalogTaskType;
  title: string;
  description: string;
  keywords: string[];
  preparations: string[];
  entryUrl?: string;
  actionType?: "url" | "api";
  availability?: "available" | "unavailable" | "unknown";
  availabilityReason?: string;
  fallbackContact: string;
};

export type TaskCatalogResolveInput = {
  query?: string;
  taskType?: string;
};

export type TaskCatalogResolution = {
  taskType?: TaskCatalogTaskType;
  title: string;
  description: string;
  preparations: string[];
  entryUrl?: string;
  actionType?: "url" | "api";
  availability?: "available" | "unavailable" | "unknown";
  availabilityReason?: string;
  fallbackContact: string;
};
