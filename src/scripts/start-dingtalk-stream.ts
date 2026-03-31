import { parseAppEnv } from "@/config/env";
import { loadEnvFiles } from "@/config/load-env-files";
import { createDingTalkStreamClient } from "@/modules/dingtalk/stream-client";
import {
  createDingTalkUserService,
  type DingTalkUserRecord,
} from "@/modules/dingtalk/dingtalk-user.service";

async function main() {
  // 这个脚本是独立于 Next.js 页面服务之外的长连接入口，用来接钉钉 Stream 消息。
  // 优先读取 .env.local，这样本地开发习惯和 Next.js 保持一致。
  console.log(`[stream] boot ${new Date().toISOString()} pid=${process.pid}`);

  loadEnvFiles();
  const env = parseAppEnv();

  // 用内存 Map 作为用户缓存 store。
  // 进程重启后缓存会丢失，但因为是懒加载，下次用户发消息会自动重新拉取，无副作用。
  // 后续接入 Prisma（需先安装 SQLite adapter）时，只需换掉这个 store 实现。
  const userCache = new Map<string, DingTalkUserRecord>();
  const userService = createDingTalkUserService({
    clientId: env.dingtalkClientId,
    clientSecret: env.dingtalkClientSecret,
    store: {
      findUser: async (userId) => userCache.get(userId) ?? null,
      upsertUser: async (record) => {
        userCache.set(record.userId, record);
      },
    },
  });

  const client = createDingTalkStreamClient({
    clientId: env.dingtalkClientId,
    clientSecret: env.dingtalkClientSecret,
    corpId: env.dingtalkCorpId,
    debug: true,
    // fire-and-forget：每次收到消息时懒加载发送者，失败不影响消息回复。
    onSender: (userId, nick) => {
      console.log(`[stream] sender userId=${userId} nick=${nick ?? "(无)"}`);
      userService
        .ensureUser(userId, nick)
        .then((record) => {
          console.log(
            `[stream] user ensured: name=${record.name ?? "(未知)"} nick=${record.nick ?? "(无)"} userId=${record.userId}`,
          );
        })
        .catch((err) => {
          console.warn(`[stream] ensureUser failed for ${userId}:`, err);
        });
    },
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
