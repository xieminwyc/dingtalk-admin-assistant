import type {
  ConversationLogRecord,
  ConversationLogRepositoryLike,
  ConversationLogRole
} from "./conversation-log.types";

export type ConversationContextTurn = {
  role: ConversationLogRole;
  content: string;
};

function filterExpiredRecords(
  records: ConversationLogRecord[],
  ttlMs?: number
): ConversationLogRecord[] {
  if (!ttlMs) {
    return records;
  }

  const now = Date.now();

  return records.filter((record) => now - record.createdAt.getTime() <= ttlMs);
}

export class ConversationContextService {
  constructor(private readonly repository: ConversationLogRepositoryLike) {}

  async loadRecentContext(
    sessionId: string,
    options: { maxTurns?: number; ttlMs?: number } = {}
  ): Promise<ConversationContextTurn[]> {
    const records = await this.repository.listBySessionId(sessionId);
    const unexpiredRecords = filterExpiredRecords(records, options.ttlMs);
    const recentRecords =
      options.maxTurns && options.maxTurns > 0
        ? unexpiredRecords.slice(-options.maxTurns)
        : unexpiredRecords;

    // 这里只暴露最小上下文视图，避免让决策层直接耦合到完整日志结构。
    return recentRecords.map((record) => ({
      role: record.role,
      content: record.content
    }));
  }
}
