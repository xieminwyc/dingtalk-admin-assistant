# 🔗 钉钉 Stream Mode 接入手册

> 这份文档面向当前项目的开发和联调阶段。  
> 目标是把“钉钉行政万事通”真正接进钉钉组织内 AI 助理，当前项目只保留机器人后端与最小调试页。

---

## 📑 目录

- [📌 你现在要做的事情](#-你现在要做的事情)
- [🏗️ 当前项目接入方式](#️-当前项目接入方式)
- [1. 钉钉后台准备](#1-钉钉后台准备)
- [2. 本地项目准备](#2-本地项目准备)
- [3. 启动顺序](#3-启动顺序)
- [4. 如何验证是否接通](#4-如何验证是否接通)
- [5. 常见问题排查](#5-常见问题排查)
- [6. 当前代码对应关系](#6-当前代码对应关系)

---

## 📌 你现在要做的事情

如果你想让这个项目真正“进钉钉”，当前最小闭环是：

1. 在钉钉后台创建组织内 AI 助理或企业内部应用
2. 开启机器人/AI 助理能力，并选择 `Stream Mode`
3. 拿到 `Client ID` 和 `Client Secret`
4. 把凭证写进本地 `.env.local`
5. 启动本项目的本地服务和 `Stream` 长连接服务
6. 在钉钉里给机器人发消息，验证是否能收到回复

---

## 🏗️ 当前项目接入方式

这套项目现在采用的是：

> **Next.js API/调试页 + 独立 DingTalk Stream 客户端**

### 为什么不是只靠 `/api/dingtalk/webhook`

因为 `Stream Mode` 的核心不是公网回调，而是：

- 你的服务主动和钉钉建立长连接
- 钉钉把消息从 Stream 通道推送给你
- 你的服务处理后再通过 `sessionWebhook` 把消息发回去

所以当前项目里会同时存在：

| 入口                 | 作用                           |
| -------------------- | ------------------------------ |
| `npm run dev`        | 跑最小调试页和普通 API         |
| `npm run stream:dev` | 跑钉钉长连接客户端，且自动重启 |

---

## 1. 钉钉后台准备

### 1.1 需要谁配合

你需要至少有以下其中一种权限：

- 企业管理员权限
- 钉钉开放平台开发者权限
- 创建组织内应用 / AI 助理的权限

如果你没有权限，需要让管理员配合。

### 1.2 创建组织内应用 / AI 助理

在钉钉开放平台里：

1. 进入开发者后台
2. 创建一个**企业内部应用**或**组织内 AI 助理**
3. 给它命名，例如：`行政万事通`
4. 配置头像、简介和可见范围

### 1.3 开启机器人或 AI 助理能力

需要给应用加上消息接收能力。  
如果后台有“机器人”“AI 助理”“自定义能力”之类的能力入口，给这个应用开启。

### 1.4 选择 Stream Mode

在接入方式上，不选普通公网 webhook，而是选：

```text
Stream Mode
```

这一步完成后，钉钉会允许你的服务通过 SDK 主动建立连接。

### 1.5 获取凭证

你需要记录下：

```text
Client ID
Client Secret
```

有些后台页面会写成：

- `AppKey / AppSecret`
- `Client ID / Client Secret`

在当前项目里，我们统一按下面两个环境变量名来使用：

```env
DINGTALK_CLIENT_ID=
DINGTALK_CLIENT_SECRET=
```

---

## 2. 本地项目准备

### 2.1 创建环境变量文件

在项目根目录执行：

```bash
cp .env.example .env.local
```

### 2.2 填写环境变量

把下面这些值补上：

```env
DATABASE_URL=postgresql://localhost:5432/dingtalk_admin_assistant
DINGTALK_CLIENT_ID=你的钉钉Client ID
DINGTALK_CLIENT_SECRET=你的钉钉Client Secret
RAG_API_URL=
SILICONFLOW_API_KEY=
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
SILICONFLOW_MODEL=Qwen/Qwen2.5-7B-Instruct
```

说明：

- `DATABASE_URL` 现在虽然还没完全数据库化，但配置项已经预留了
- `RAG_API_URL` 目前可以留空
- 最关键的是 `DINGTALK_CLIENT_ID` 和 `DINGTALK_CLIENT_SECRET`
- 如果你希望走“模型决策 + 模型生成回复”，还需要补上 `SILICONFLOW_*`

### 2.3 安装依赖

如果你还没装：

```bash
npm install
```

---

## 3. 启动顺序

### 3.1 启动本地服务

```bash
npm run dev
```

作用：

- 打开最小调试页
- 保留 `Next.js` API 路由能力

### 3.2 启动 Stream 长连接

另开一个终端窗口：

```bash
npm run stream:dev
```

`stream:dev` 现在使用 watch 模式，修改后端代码后会自动重启。

这个脚本入口在：

[start-dingtalk-stream.ts](/Users/xiemin/monter/dingtalk-admin-assistant/src/scripts/start-dingtalk-stream.ts)

### 3.3 看到什么算正常

正常情况下你会看到类似：

```text
DingTalk Stream client connected.
```

如果没有配置环境变量，会直接报错，这是正常保护行为。

---

## 4. 如何验证是否接通

### 验证 1：本地调试页正常

打开：

```text
http://localhost:3001
```

你应该能看到“钉钉机器人后端已启动”。

### 验证 2：Stream 连接已建立

启动 `npm run stream:dev` 后，确认控制台没有报凭证错误、连接错误或权限错误。

### 验证 3：钉钉内给机器人发消息

在钉钉里找到你刚创建的 `行政万事通`，发一条消息，例如：

```text
年假规则是什么
```

如果接通成功，当前版本应该能回类似下面的文本：

```text
结论
年假天数按司龄计算，试用期不单独享有年假，具体以 HR 制度公告为准。

适用范围
适用于正式员工年假政策查询
```

你也可以再测一条事务型请求：

```text
我要请假
```

当前版本应该会回带入口的事务指引，例如：

```text
事务入口
https://oa.example.com/tasks/leave-application

操作指引
用于发起请假审批，适合年假、病假、事假等场景。
办理前准备：确认请假日期、准备请假类型、提前和直属主管沟通
```

### 验证 4：确认是否真的走了模型决策与模型回复

如果你已经配置了 `SILICONFLOW_*`，当前版本会有两次模型调用：

1. `Decision Engine`
   - 判断这轮是 `knowledge / task / chat / clarify`
2. `Response Generator`
   - 基于工具事实生成最终自然回复

控制台里你会看到类似日志：

```text
[intent] source=model action=decide query="我要请假"
[siliconflow] request model="Qwen/Qwen2.5-7B-Instruct" query="我要请假"
[siliconflow] response mode=task query="我要请假"
[response] request model="Qwen/Qwen2.5-7B-Instruct" mode=task query="我要请假"
[response] response mode=task query="我要请假" generated=true
```

如果你只看到了本地回复，但没看到这些日志，优先检查：

- `.env.local` 里的 `SILICONFLOW_*` 是否真的存在
- `stream:dev` 是否已经在改完环境变量后重启
- 请求是不是只落到了本地兜底

---

## 5. 常见问题排查

### 5.1 `stream:dev` 一启动就报环境变量错误

典型原因：

- 没有 `.env.local`
- 没填 `DINGTALK_CLIENT_ID`
- 没填 `DINGTALK_CLIENT_SECRET`

先检查：

```bash
cat .env.local
```

### 5.2 钉钉后台已经配了，但本地连不上

优先排查：

- `Client ID / Secret` 是否填错
- 应用是否真的开启了 `Stream Mode`
- 当前应用是否具备机器人/AI 助理消息接收能力
- 是否同一个凭证在别的地方已经起了另一个 Stream 客户端

> 钉钉官方示例特别提醒：同一个 `client-id` 同一时间尽量只启动一个 Stream 服务，避免互相干扰。

### 5.3 能连上，但钉钉里发消息没回复

优先检查：

- 本地 `stream:dev` 进程是否还在
- 是否真的收到了 `TOPIC_ROBOT` 机器人消息
- assistant service 是否抛错
- `sessionWebhook` 回发是否失败

### 5.4 调试页能打开，但和钉钉没关系

这是正常的。  
因为首页只是本地调试页，真正接钉钉靠的是：

```text
npm run stream:dev
```

不是单靠 `http://localhost:3001`

### 5.5 想验证“上下文连续对话”有没有生效

当前版本已经把 `sessionWebhook` 当成连续会话的 `sessionId`。

这意味着在同一个钉钉会话里：

- 先问：`你能做什么`
- 再问：`那请假怎么申请`
- 再问：`那年假和事假有什么区别`

助手会把最近几轮上下文一起送进决策器，而不是每句话都孤立判断。

如果你想本地调试 webhook，也可以显式传一个固定 `sessionId`：

```bash
curl -X POST http://localhost:3001/api/dingtalk/webhook \
  -H 'Content-Type: application/json' \
  -d '{
    "sessionId": "debug-session-1",
    "text": {
      "content": "年假规则是什么"
    }
  }'
```

然后继续用同一个 `sessionId` 发下一条：

```bash
curl -X POST http://localhost:3001/api/dingtalk/webhook \
  -H 'Content-Type: application/json' \
  -d '{
    "sessionId": "debug-session-1",
    "text": {
      "content": "那请假怎么申请"
    }
  }'
```

这样最适合本地验证“上下文是否真的被用到了”。

---

## 6. 当前代码对应关系

### API 与调试页

| 文件                                                                                            | 作用                  |
| ----------------------------------------------------------------------------------------------- | --------------------- |
| [page.tsx](/Users/xiemin/monter/dingtalk-admin-assistant/src/app/page.tsx)                      | 最小调试页入口        |
| [route.ts](/Users/xiemin/monter/dingtalk-admin-assistant/src/app/api/dingtalk/webhook/route.ts) | 本地 webhook API 路由 |

### Stream 接入层

| 文件                                                                                                           | 作用                         |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| [stream-handler.ts](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/dingtalk/stream-handler.ts)      | 处理单条钉钉消息             |
| [stream-client.ts](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/dingtalk/stream-client.ts)        | SDK 封装、监听器注册、回消息 |
| [start-dingtalk-stream.ts](/Users/xiemin/monter/dingtalk-admin-assistant/src/scripts/start-dingtalk-stream.ts) | 启动长连接客户端             |

### 业务层

| 文件                                                                                                                           | 作用                           |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| [create-assistant-runtime.ts](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/assistant/create-assistant-runtime.ts) | 统一组装默认 runtime           |
| [assistant.service.ts](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/assistant/assistant.service.ts)               | 问答主流程编排                 |
| [response-generator.ts](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/assistant/response-generator.ts)             | 基于工具事实生成自然回复       |
| [reply-builder.ts](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/assistant/reply-builder.ts)                       | 模型生成失败时的文本兜底       |
| [request-router.ts](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/router/request-router.ts)                        | 按 `mode` 协调知识 / 事务 / 澄清 |
| [intent-analyzer.ts](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/intents/intent-analyzer.ts)                     | 模型主导的决策器适配层         |
| [model-intent-classifier.ts](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/intents/model-intent-classifier.ts)     | 调用 SiliconFlow 生成结构化决策 |
| [knowledge-card-retriever.ts](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/knowledge/knowledge-card-retriever.ts) | 本地知识卡片检索               |
| [task-catalog.service.ts](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/tasks/task-catalog.service.ts)             | 事务目录入口解析               |
| [conversation-context.service.ts](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/logging/conversation-context.service.ts) | 读取最近几轮会话上下文         |

### 内容整理流程

当前项目的知识内容流程是：

```text
钉钉文档 -> 人工整理 -> Markdown 卡片 -> 本地知识卡 / 事务目录
```

模板文档见：

[knowledge-card-template.md](/Users/xiemin/monter/dingtalk-admin-assistant/docs/knowledge-card-template.md)

---

## ✅ 当前阶段结论

你现在不需要再纠结“Next.js 路由有没有配好”，因为真正接钉钉的关键动作已经切到：

```text
Stream Mode + 独立长连接客户端
```

你接下来最重要的工作就是：

1. 去钉钉后台创建/配置应用
2. 拿到 `Client ID / Client Secret`
3. 写入 `.env.local`
4. 启动 `npm run stream:dev`
5. 在钉钉里给机器人发消息验证

---

## 🔗 参考资料

- 钉钉 SDK 概述  
  https://open-dingtalk.github.io/developerpedia/docs/develop/sdk/overview/
- 启动 Stream 服务  
  https://open-dingtalk.github.io/developerpedia/docs/develop/agent/bootstrap/
- 官方 Node SDK  
   https://github.com/open-dingtalk/dingtalk-stream-sdk-nodejs

### 当前消息处理链路

当前版本已经不是“规则优先 + 固定模板”了，而是：

```text
用户输入消息
  ->
Stream / Webhook 入口
  ->
assistant.reply({ query, sessionId })
  ->
ConversationContextService.loadRecentContext(sessionId)
  ->
IntentAnalyzer.analyze({ query, conversationContext })
  ->
ModelIntentClassifier.classify(...)
  ->
得到 AssistantDecision
  ->
RequestRouter.route(...)
  ->
Knowledge / Task / Clarify / Chat
  ->
ResponseGenerator.generate(...)
  ->
如果生成失败，再退回 ReplyBuilder
  ->
把用户消息和助手回复都写回 ConversationLogRepository
  ->
最终回复用户
```

如果拆成你最关心的几个核心函数，顺序是：

1. [`createAssistantRuntime()`](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/assistant/create-assistant-runtime.ts)
   负责把 `analyzer`、`responseGenerator`、knowledge provider、task provider、上下文服务装起来
2. [`assistant.reply()`](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/assistant/assistant.service.ts)
   真正的主编排入口
3. [`loadRecentContext()`](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/logging/conversation-context.service.ts)
   读取最近几轮上下文
4. [`analyzer.analyze()`](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/intents/intent-analyzer.ts)
   让模型产出 `knowledge / task / chat / clarify`
5. [`router.route()`](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/router/request-router.ts)
   根据 `mode` 决定要不要调用知识或事务工具
6. [`responseGenerator.generate()`](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/assistant/response-generator.ts)
   基于工具事实生成自然回复
7. [`buildAssistantReply()`](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/assistant/reply-builder.ts)
   只在模型生成失败时兜底
