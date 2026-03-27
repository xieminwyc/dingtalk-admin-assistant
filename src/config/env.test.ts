import { describe, expect, it } from "vitest";

import { parseAppEnv } from "./env";

describe("parseAppEnv", () => {
  it("returns typed config when required environment values are present", () => {
    const env = parseAppEnv({
      DATABASE_URL: "postgres://localhost:5432/admin_assistant",
      DINGTALK_CLIENT_ID: "client-id",
      DINGTALK_CLIENT_SECRET: "client-secret",
      RAG_API_URL: "https://rag.example.com/search"
    });

    expect(env.databaseUrl).toBe("postgres://localhost:5432/admin_assistant");
    expect(env.dingtalkClientId).toBe("client-id");
    expect(env.ragApiUrl).toBe("https://rag.example.com/search");
  });

  it("allows DATABASE_URL to be omitted before the database layer is wired in", () => {
    const env = parseAppEnv({
      DINGTALK_CLIENT_ID: "client-id",
      DINGTALK_CLIENT_SECRET: "client-secret"
    });

    expect(env.databaseUrl).toBeUndefined();
    expect(env.dingtalkClientId).toBe("client-id");
  });

  it("parses optional SiliconFlow intent model settings when present", () => {
    const env = parseAppEnv({
      DINGTALK_CLIENT_ID: "client-id",
      DINGTALK_CLIENT_SECRET: "client-secret",
      SILICONFLOW_API_KEY: "sf-api-key",
      SILICONFLOW_BASE_URL: "https://api.siliconflow.cn",
      SILICONFLOW_MODEL: "deepseek-v3"
    });

    expect(env.siliconflowApiKey).toBe("sf-api-key");
    expect(env.siliconflowBaseUrl).toBe("https://api.siliconflow.cn");
    expect(env.siliconflowModel).toBe("deepseek-v3");
  });

  it("keeps SiliconFlow intent model settings optional when not configured", () => {
    const env = parseAppEnv({
      DINGTALK_CLIENT_ID: "client-id",
      DINGTALK_CLIENT_SECRET: "client-secret"
    });

    expect(env.siliconflowApiKey).toBeUndefined();
    expect(env.siliconflowBaseUrl).toBeUndefined();
    expect(env.siliconflowModel).toBeUndefined();
  });

  it("treats an empty RAG_API_URL as not configured", () => {
    const env = parseAppEnv({
      DINGTALK_CLIENT_ID: "client-id",
      DINGTALK_CLIENT_SECRET: "client-secret",
      RAG_API_URL: ""
    });

    expect(env.ragApiUrl).toBeUndefined();
  });

  it("throws when a required DingTalk credential is missing", () => {
    expect(() =>
      parseAppEnv({
        DINGTALK_CLIENT_SECRET: "client-secret"
      })
    ).toThrow(/DINGTALK_CLIENT_ID/);
  });
});
