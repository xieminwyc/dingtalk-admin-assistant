// 会话日志只保留路由边界上真正会用到的最小字段，
// 这样后续无论底层换成内存、Prisma 还是别的存储，调用方都不用改太多。
export type ConversationLogRouteType =
  | "knowledge_query"
  | "task_request"
  | "handoff_request"
  | "smalltalk"
  | "unknown";

export type ConversationLogRecord = {
  id: string;
  conversationId: string;
  messageId: string;
  userId: string;
  query: string;
  // routeType 记录的是“这条消息最后被分到哪一类路由”。
  routeType: ConversationLogRouteType;
  // Prisma 读出来会用 null 表示“没有值”，所以输出契约现在就直接写成 null，
  // 这样上层以后接数据库时不会再经历一次暗转。
  // confidence 保留原始置信度，方便后续分析路由阈值是否合理。
  routeConfidence: number | null;
  // 这是最终命中的知识卡引用，不是候选痕迹；没有最终命中时就明确为 null。
  knowledgeCardId: string | null;
  // 这是最终命中的事务目录项引用，不是候选痕迹；没有最终命中时就明确为 null。
  taskCatalogItemId: string | null;
  createdAt: Date;
};

export type ConversationLogAppendInput = {
  conversationId: string;
  messageId: string;
  userId: string;
  query: string;
  routeType: ConversationLogRouteType;
  routeConfidence?: number;
  knowledgeCardId?: string;
  taskCatalogItemId?: string;
};

// 仓库边界只暴露 append 和按会话查询两种能力，
// 这样后续可以平滑替换成 Prisma repository 而不影响调用方。
export interface ConversationLogRepositoryLike {
  append(input: ConversationLogAppendInput): Promise<ConversationLogRecord>;
  listByConversationId(conversationId: string): Promise<ConversationLogRecord[]>;
}
