import { parseAppEnv } from "@/config/env";
import { loadEnvFiles } from "@/config/load-env-files";
import { createDingTalkStreamClient } from "@/modules/dingtalk/stream-client";

async function main() {
  // 这个脚本是独立于 Next.js 页面服务之外的长连接入口，用来接钉钉 Stream 消息。
  // 优先读取 .env.local，这样本地开发习惯和 Next.js 保持一致。
  console.log(
    `[stream] boot ${new Date().toISOString()} pid=${process.pid}`
  );

  loadEnvFiles();
  const env = parseAppEnv();
  const client = createDingTalkStreamClient({
    clientId: env.dingtalkClientId,
    clientSecret: env.dingtalkClientSecret,
    debug: true
  });

  const shutdown = () => {
    console.log(`[stream] shutdown pid=${process.pid}`);
    client.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await client.connect();
  console.log("DingTalk Stream client connected.");
}

main().catch((error) => {
  console.error("Failed to start DingTalk Stream client:", error);
  process.exit(1);
});
