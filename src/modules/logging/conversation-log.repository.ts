import { randomUUID } from "node:crypto";

import type {
  ConversationLogAppendInput,
  ConversationLogRecord,
  ConversationLogRepositoryLike
} from "./conversation-log.types";

type StoredConversationLogRecord = ConversationLogRecord & {
  sequence: number;
};

function cloneRecord(
  record: StoredConversationLogRecord
): ConversationLogRecord {
  const { sequence: _sequence, ...publicRecord } = record;

  return {
    ...publicRecord,
    createdAt: new Date(record.createdAt)
  };
}

// 这个仓库先做成内存版，目的是先把日志边界和字段契约固定下来；
// 后续要换 Prisma 时，只要保持同样的 append / listByConversationId 语义即可。
export class ConversationLogRepository implements ConversationLogRepositoryLike {
  private readonly records: StoredConversationLogRecord[] = [];
  private sequence = 0;

  async append(input: ConversationLogAppendInput): Promise<ConversationLogRecord> {
    const record: StoredConversationLogRecord = {
      id: randomUUID(),
      conversationId: input.conversationId,
      sessionId: input.sessionId,
      messageId: input.messageId,
      userId: input.userId,
      query: input.query,
      content: input.content,
      role: input.role,
      routeType: input.routeType,
      // 内部先统一归一成 null，避免上层以后接 Prisma 时再经历一次 undefined -> null 的暗转。
      routeConfidence: input.routeConfidence ?? null,
      // 这里保存的是“最终命中的关联引用”，没有命中就明确落 null。
      knowledgeCardId: input.knowledgeCardId ?? null,
      taskCatalogItemId: input.taskCatalogItemId ?? null,
      createdAt: new Date(),
      // sequence 是持久化排序兜底字段，和 createdAt 一起保证同毫秒写入的稳定顺序。
      sequence: this.sequence++
    };

    // 先复制后返回，避免调用方改写返回值反向污染内存仓库。
    this.records.push(record);

    return cloneRecord(record);
  }

  async listByConversationId(
    conversationId: string
  ): Promise<ConversationLogRecord[]> {
    return this.records
      .filter((record) => record.conversationId === conversationId)
      .sort(compareConversationLogRecords)
      .map(cloneRecord);
  }

  async listBySessionId(sessionId: string): Promise<ConversationLogRecord[]> {
    return this.records
      .filter((record) => record.sessionId === sessionId)
      .sort(compareConversationLogRecords)
      .map(cloneRecord);
  }
}

function compareConversationLogRecords(
  left: StoredConversationLogRecord,
  right: StoredConversationLogRecord
) {
  const timeDelta = left.createdAt.getTime() - right.createdAt.getTime();

  if (timeDelta !== 0) {
    return timeDelta;
  }

  return left.sequence - right.sequence;
}

export type {
  ConversationLogAppendInput,
  ConversationLogRecord,
  ConversationLogRepositoryLike
} from "./conversation-log.types";
