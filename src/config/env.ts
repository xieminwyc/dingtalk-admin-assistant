import { z } from "zod";

// 把运行时环境变量统一收口到这里，后面无论是接数据库还是接 RAG，都只从这里取值。
const appEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required").optional(),
  DINGTALK_CLIENT_ID: z.string().min(1, "DINGTALK_CLIENT_ID is required"),
  DINGTALK_CLIENT_SECRET: z
    .string()
    .min(1, "DINGTALK_CLIENT_SECRET is required"),
  RAG_API_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional()
  ),
  SILICONFLOW_API_KEY: z
    .string()
    .min(1, "SILICONFLOW_API_KEY is required")
    .optional(),
  SILICONFLOW_BASE_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional()
  ),
  SILICONFLOW_MODEL: z
    .string()
    .min(1, "SILICONFLOW_MODEL is required")
    .optional(),
});

export type AppEnv = {
  databaseUrl?: string;
  dingtalkClientId: string;
  dingtalkClientSecret: string;
  ragApiUrl?: string;
  siliconflowApiKey?: string;
  siliconflowBaseUrl?: string;
  siliconflowModel?: string;
};

export function parseAppEnv(
  env: Partial<Record<string, string | undefined>> = process.env
): AppEnv {
  // 用 schema 在启动期就把配置问题拦住，避免接口跑到一半才发现缺变量。
  const parsed = appEnvSchema.parse(env);

  return {
    databaseUrl: parsed.DATABASE_URL,
    dingtalkClientId: parsed.DINGTALK_CLIENT_ID,
    dingtalkClientSecret: parsed.DINGTALK_CLIENT_SECRET,
    ragApiUrl: parsed.RAG_API_URL,
    siliconflowApiKey: parsed.SILICONFLOW_API_KEY,
    siliconflowBaseUrl: parsed.SILICONFLOW_BASE_URL,
    siliconflowModel: parsed.SILICONFLOW_MODEL,
  };
}
