import { describe, expect, it, vi } from "vitest";

import { ConversationLogRepository } from "./conversation-log.repository";
import { ConversationContextService } from "./conversation-context.service";

describe("ConversationContextService", () => {
  it("returns only the latest turns for one session in chronological order", async () => {
    const repository = new ConversationLogRepository();
    const service = new ConversationContextService(repository);

    await repository.append({
      conversationId: "conv-1",
      sessionId: "session-1",
      messageId: "msg-1",
      userId: "user-1",
      query: "第一句",
      content: "第一句",
      role: "user",
      routeType: "smalltalk"
    });
    await repository.append({
      conversationId: "conv-1",
      sessionId: "session-1",
      messageId: "msg-2",
      userId: "user-1",
      query: "第二句",
      content: "第二句",
      role: "assistant",
      routeType: "smalltalk"
    });
    await repository.append({
      conversationId: "conv-1",
      sessionId: "session-1",
      messageId: "msg-3",
      userId: "user-1",
      query: "第三句",
      content: "第三句",
      role: "user",
      routeType: "smalltalk"
    });

    const context = await service.loadRecentContext("session-1", {
      maxTurns: 2
    });

    expect(context).toEqual([
      {
        role: "assistant",
        content: "第二句"
      },
      {
        role: "user",
        content: "第三句"
      }
    ]);
  });

  it("drops expired turns when ttl is exceeded", async () => {
    const repository = new ConversationLogRepository();
    const service = new ConversationContextService(repository);

    vi.useFakeTimers();

    try {
      vi.setSystemTime(new Date("2026-03-28T12:00:00.000Z"));
      await repository.append({
        conversationId: "conv-2",
        sessionId: "session-2",
        messageId: "msg-1",
        userId: "user-2",
        query: "旧消息",
        content: "旧消息",
        role: "user",
        routeType: "smalltalk"
      });

      vi.setSystemTime(new Date("2026-03-28T12:10:00.000Z"));
      await repository.append({
        conversationId: "conv-2",
        sessionId: "session-2",
        messageId: "msg-2",
        userId: "user-2",
        query: "新消息",
        content: "新消息",
        role: "user",
        routeType: "smalltalk"
      });

      const context = await service.loadRecentContext("session-2", {
        ttlMs: 60_000
      });

      expect(context).toEqual([
        {
          role: "user",
          content: "新消息"
        }
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never leaks turns from another session", async () => {
    const repository = new ConversationLogRepository();
    const service = new ConversationContextService(repository);

    await repository.append({
      conversationId: "conv-a",
      sessionId: "session-a",
      messageId: "msg-a",
      userId: "user-a",
      query: "A1",
      content: "A1",
      role: "user",
      routeType: "smalltalk"
    });
    await repository.append({
      conversationId: "conv-b",
      sessionId: "session-b",
      messageId: "msg-b",
      userId: "user-b",
      query: "B1",
      content: "B1",
      role: "user",
      routeType: "smalltalk"
    });

    const context = await service.loadRecentContext("session-a");

    expect(context).toEqual([
      {
        role: "user",
        content: "A1"
      }
    ]);
  });
});
