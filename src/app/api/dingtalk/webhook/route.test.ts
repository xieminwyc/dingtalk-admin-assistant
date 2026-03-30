import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

function buildDecisionPayload(query: string) {
  if (query.includes("请假")) {
    return {
      mode: "task",
      intentConfidence: 0.94,
      needKnowledge: false,
      needTaskResolution: true,
      toolPlan: "task",
      topicShift: false,
      taskHint: "leave_application"
    };
  }

  return {
    mode: "internal_knowledge",
    intentConfidence: 0.93,
    needKnowledge: true,
    needTaskResolution: false,
    toolPlan: "knowledge",
    topicShift: false,
    knowledgeHint: "年假规则"
  };
}

function buildGeneratedReply(query: string) {
  if (query.includes("请假")) {
    return "事务入口\nhttps://oa.example.com/tasks/leave-application\n\n操作指引\n请按入口提示继续办理";
  }

  return "结论\n年假天数按司龄计算，试用期不单独享有年假，具体以 HR 制度公告为准。\n\n适用范围\n适用于正式员工年假政策查询";
}

describe("POST /api/dingtalk/webhook", () => {
  beforeEach(() => {
    process.env.SILICONFLOW_API_KEY = "test-key";
    process.env.SILICONFLOW_BASE_URL = "https://api.siliconflow.cn/v1";
    process.env.SILICONFLOW_MODEL = "Qwen/Qwen3-8B";

    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const requestBody = JSON.parse(String(init?.body ?? "{}")) as {
        messages?: Array<{ content?: string }>;
      };
      const query =
        requestBody.messages?.[1]?.content?.split("当前用户消息：")[1]?.trim() ?? "";
      const systemPrompt = requestBody.messages?.[0]?.content ?? "";

      if (String(systemPrompt).includes("回复生成器")) {
        return Response.json({
          choices: [
            {
              message: {
                content: buildGeneratedReply(query)
              }
            }
          ]
        });
      }

      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify(buildDecisionPayload(query))
            }
          }
        ]
      });
    });
  });

  afterEach(() => {
    delete process.env.SILICONFLOW_API_KEY;
    delete process.env.SILICONFLOW_BASE_URL;
    delete process.env.SILICONFLOW_MODEL;
    vi.restoreAllMocks();
  });

  it("returns a task entry reply for a transactional request", async () => {
    const request = new Request("http://localhost/api/dingtalk/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: {
          content: "我要请假"
        }
      })
    });

    const response = await POST(request);
    const data = (await response.json()) as {
      reply?: string;
    };

    expect(response.status).toBe(200);
    expect(data.reply).toContain("事务入口");
    expect(data.reply).toContain("https://oa.example.com/tasks/leave-application");
  });

  it("returns a knowledge reply for a knowledge request", async () => {
    const request = new Request("http://localhost/api/dingtalk/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: {
          content: "年假规则是什么"
        }
      })
    });

    const response = await POST(request);
    const data = (await response.json()) as {
      reply?: string;
    };

    expect(response.status).toBe(200);
    expect(data.reply).toContain("结论");
    expect(data.reply).toContain("年假天数按司龄计算");
  });

  it("can return debug payloads for the web debug page", async () => {
    const request = new Request("http://localhost/api/dingtalk/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        debug: true,
        sessionId: "page-debug-session",
        text: {
          content: "年假规则是什么"
        }
      })
    });

    const response = await POST(request);
    const data = (await response.json()) as {
      reply?: string;
      debug?: {
        intent?: {
          mode?: string;
          knowledgeHint?: string;
          source?: string;
        };
        resolution?: {
          kind?: string;
          referenceLabel?: string;
        };
        usedResponseGenerator?: boolean;
      };
    };

    expect(response.status).toBe(200);
    expect(data.reply).toContain("年假天数按司龄计算");
    expect(data.debug?.intent?.mode).toBe("internal_knowledge");
    expect(data.debug?.intent?.knowledgeHint).toBe("年假规则");
    expect(data.debug?.resolution?.kind).toBe("knowledge");
    expect(data.debug?.usedResponseGenerator).toBe(true);
  });

  it("rejects an empty user message", async () => {
    const request = new Request("http://localhost/api/dingtalk/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: {
          content: "   "
        }
      })
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });
});
