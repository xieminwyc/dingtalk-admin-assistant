import { describe, expect, it } from "vitest";

import { POST } from "./route";

describe("POST /api/dingtalk/webhook", () => {
  it("returns an assistant reply for a valid DingTalk message payload", async () => {
    const request = new Request("http://localhost/api/dingtalk/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: {
          content: "补卡流程是什么"
        }
      })
    });

    const response = await POST(request);
    const data = (await response.json()) as {
      reply?: string;
    };

    expect(response.status).toBe(200);
    expect(data.reply).toContain("补卡");
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
