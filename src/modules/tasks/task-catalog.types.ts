// 事务类型先用稳定的业务 code 表达，后续路由层可以直接复用。
export type TaskCatalogTaskType =
  | "leave_application"
  | "expense_application"
  | "overtime_application"
  | "meeting_room_booking"
  | "permission_access"
  | "office_supply_purchase";

export type TaskCatalogItem = {
  taskType: TaskCatalogTaskType;
  title: string;
  description: string;
  keywords: string[];
  preparations: string[];
  entryUrl?: string;
  // processCode 是钉钉审批模板的唯一标识，用于生成审批直达链接。
  // 在钉钉「OA 审批」→「审批模板」里查看对应模板的 processCode。
  processCode?: string;
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
  processCode?: string;
  actionType?: "url" | "api";
  availability?: "available" | "unavailable" | "unknown";
  availabilityReason?: string;
  fallbackContact: string;
};
