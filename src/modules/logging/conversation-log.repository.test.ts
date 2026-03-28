import { describe, expect, it, vi } from "vitest";

import {
  ConversationLogRepository,
  type ConversationLogAppendInput
} from "./conversation-log.repository";

describe("ConversationLogRepository", () => {
  it("appends a log and keeps it queryable by conversation", async () => {
    const repository = new ConversationLogRepository();

    const input: ConversationLogAppendInput = {
      conversationId: "conv-1",
      sessionId: "session-1",
      messageId: "msg-1",
      userId: "user-1",
      query: "我要请假",
      content: "我要请假",
      role: "user",
      routeType: "task_request",
      routeConfidence: 0.94
    };

    const created = await repository.append(input);
    const logs = await repository.listByConversationId("conv-1");

    expect(created.id).toBeDefined();
    expect(created.conversationId).toBe("conv-1");
    expect(created.routeType).toBe("task_request");
    expect(created.routeConfidence).toBe(0.94);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      conversationId: "conv-1",
      sessionId: "session-1",
      messageId: "msg-1",
      userId: "user-1",
      query: "我要请假",
      content: "我要请假",
      role: "user",
      routeType: "task_request",
      routeConfidence: 0.94
    });
    expect(logs[0].knowledgeCardId).toBeNull();
    expect(logs[0].taskCatalogItemId).toBeNull();
    expect("sequence" in logs[0]).toBe(false);
  });

  it("stores the final knowledge reference as a nullable output field", async () => {
    const repository = new ConversationLogRepository();

    await repository.append({
      conversationId: "conv-2",
      sessionId: "session-2",
      messageId: "msg-2",
      userId: "user-2",
      query: "年假规则是什么",
      content: "年假规则是什么",
      role: "user",
      routeType: "knowledge_query",
      routeConfidence: 0.81,
      knowledgeCardId: "card-1"
    });

    const [log] = await repository.listByConversationId("conv-2");

    expect(log).toMatchObject({
      conversationId: "conv-2",
      routeType: "knowledge_query",
      routeConfidence: 0.81,
      knowledgeCardId: "card-1"
    });
    expect(log.taskCatalogItemId).toBeNull();
    expect("sequence" in log).toBe(false);
  });

  it("stores the final task reference as a nullable output field", async () => {
    const repository = new ConversationLogRepository();

    await repository.append({
      conversationId: "conv-3",
      sessionId: "session-3",
      messageId: "msg-3",
      userId: "user-3",
      query: "帮我发起报销",
      content: "帮我发起报销",
      role: "user",
      routeType: "task_request",
      taskCatalogItemId: "task-1"
    });

    const [log] = await repository.listByConversationId("conv-3");

    expect(log).toMatchObject({
      conversationId: "conv-3",
      routeType: "task_request",
      taskCatalogItemId: "task-1"
    });
    expect(log.routeConfidence).toBeNull();
    expect(log.knowledgeCardId).toBeNull();
    expect("sequence" in log).toBe(false);
  });

  it("returns logs in createdAt ascending order and keeps append order for ties", async () => {
    const repository = new ConversationLogRepository();
    const now = new Date("2026-03-27T12:00:00.000Z");

    vi.useFakeTimers();
    vi.setSystemTime(now);

    try {
      await repository.append({
        conversationId: "conv-4",
        sessionId: "session-4",
        messageId: "msg-1",
        userId: "user-4",
        query: "第一条",
        content: "第一条",
        role: "user",
        routeType: "smalltalk"
      });
      await repository.append({
        conversationId: "conv-4",
        sessionId: "session-4",
        messageId: "msg-2",
        userId: "user-4",
        query: "第二条",
        content: "第二条",
        role: "assistant",
        routeType: "smalltalk"
      });
    } finally {
      vi.useRealTimers();
    }

    const logs = await repository.listByConversationId("conv-4");

    expect(logs.map((log) => log.messageId)).toEqual(["msg-1", "msg-2"]);
    expect(logs[0].createdAt.getTime()).toBe(now.getTime());
    expect(logs[1].createdAt.getTime()).toBe(now.getTime());
    expect("sequence" in logs[0]).toBe(false);
    expect("sequence" in logs[1]).toBe(false);
  });

  it("allows logs to be queried by session id", async () => {
    const repository = new ConversationLogRepository();

    await repository.append({
      conversationId: "conv-a",
      sessionId: "session-a",
      messageId: "msg-a",
      userId: "user-a",
      query: "你能做什么",
      content: "你能做什么",
      role: "user",
      routeType: "smalltalk"
    });
    await repository.append({
      conversationId: "conv-b",
      sessionId: "session-b",
      messageId: "msg-b",
      userId: "user-b",
      query: "我要请假",
      content: "我要请假",
      role: "user",
      routeType: "task_request"
    });

    const logs = await repository.listBySessionId("session-a");

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      sessionId: "session-a",
      content: "你能做什么",
      role: "user"
    });
  });
});
