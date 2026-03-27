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

| 入口 | 作用 |
| --- | --- |
| `npm run dev` | 跑最小调试页和普通 API |
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
```

说明：

- `DATABASE_URL` 现在虽然还没完全数据库化，但配置项已经预留了
- `RAG_API_URL` 目前可以留空
- 最关键的是 `DINGTALK_CLIENT_ID` 和 `DINGTALK_CLIENT_SECRET`

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
补卡流程是什么
```

如果接通成功，当前版本应该能回类似下面的文本：

```text
结论
进入审批后发起补卡申请，由直属主管审批。

适用范围
适用于因漏打卡产生异常的员工
```

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

---

## 6. 当前代码对应关系

### API 与调试页

| 文件 | 作用 |
| --- | --- |
| [page.tsx](/Users/xiemin/monter/dingtalk-admin-assistant/src/app/page.tsx) | 最小调试页入口 |
| [route.ts](/Users/xiemin/monter/dingtalk-admin-assistant/src/app/api/dingtalk/webhook/route.ts) | 本地 webhook API 路由 |

### Stream 接入层

| 文件 | 作用 |
| --- | --- |
| [stream-handler.ts](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/dingtalk/stream-handler.ts) | 处理单条钉钉消息 |
| [stream-client.ts](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/dingtalk/stream-client.ts) | SDK 封装、监听器注册、回消息 |
| [start-dingtalk-stream.ts](/Users/xiemin/monter/dingtalk-admin-assistant/src/scripts/start-dingtalk-stream.ts) | 启动长连接客户端 |

### 业务层

| 文件 | 作用 |
| --- | --- |
| [assistant.service.ts](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/assistant/assistant.service.ts) | 问答主流程 |
| [reply-builder.ts](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/assistant/reply-builder.ts) | 统一回复格式 |
| [faq-retriever.ts](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/knowledge/faq-retriever.ts) | FAQ 检索 |
| [handoff.service.ts](/Users/xiemin/monter/dingtalk-admin-assistant/src/modules/handoff/handoff.service.ts) | 转人工判断 |

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
