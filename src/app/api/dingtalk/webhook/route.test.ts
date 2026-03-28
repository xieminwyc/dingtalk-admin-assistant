import { describe, expect, it } from "vitest";

import { POST } from "./route";

describe("POST /api/dingtalk/webhook", () => {
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
