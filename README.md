# 🏢 DingTalk Admin Assistant

> 一个独立的新项目，用于建设“钉钉行政万事通”一期 MVP。  
> 当前项目已收敛为“钉钉机器人后端 + 本地调试页”，不再承载工作台/H5 应用形态。

---

## 📑 目录

- [📌 项目定位](#-项目定位)
- [🎯 一期目标](#-一期目标)
- [🧱 当前项目结构](#-当前项目结构)
- [🗺️ 当前阶段重点](#️-当前阶段重点)
- [🚀 本地运行](#-本地运行)
- [🧠 当前能力](#-当前能力)
- [🗂️ 内容整理方式](#️-内容整理方式)
- [🔗 钉钉接入说明](#-钉钉接入说明)
- [🧭 当前开发入口](#-当前开发入口)

---

## 📌 项目定位

这个项目不是在现有聊天应用上改造，而是一个**从零开始的新项目**。

目标是为公司内部员工提供一个在钉钉内可访问的“行政万事通”机器人，支持：

- 员工高频知识问答
- 事务入口指引
- 转人工边界控制
- 后续接入外部 RAG 检索接口

---

## 🎯 一期目标

一期先完成以下能力：

- 搭建钉钉组织内 AI 助理入口
- 建立知识卡片与事务目录
- 建立意图分析与请求路由骨架
- 预留 RAG Provider 接口

一期暂不优先：

- 全量制度文档导入
- 重型 RAG 检索链路
- 后台管理系统完整实现
- 多部门同时上线

---

## 🧱 当前项目结构

```text
dingtalk-admin-assistant/
├── README.md
└── docs/
    └── superpowers/
        ├── plans/
        └── specs/
```

---

## 🗺️ 当前阶段重点

当前以机器人联调为主，日常只需要关注两条运行入口：

- `npm run dev`
  - 启动 Next.js API 路由和最小调试页
- `npm run stream:dev`
  - 启动钉钉 Stream Mode 长连接客户端，且监听代码改动自动重启

当前主链路已经从“FAQ-only”演进到：

- 意图分析
- 请求路由
- 本地知识卡片
- 事务目录
- 本地 webhook / 钉钉 stream 共用同一套 runtime

后续代码阶段建议采用：

- `Node.js`
- `TypeScript`
- `Next.js`
- `App Router + API Routes`
- `PostgreSQL`
- `Prisma`
- `OpenAI Compatible LLM API`
- `DingTalk AI Assistant / Stream Mode / 直通模式`

---

## 🚀 本地运行

### 1. 安装依赖

```bash
npm install
```

### 2. 准备环境变量

复制一份环境变量模板：

```bash
cp .env.example .env.local
```

然后至少填写以下内容：

```env
DATABASE_URL=postgresql://localhost:5432/dingtalk_admin_assistant
DINGTALK_CLIENT_ID=your-dingtalk-client-id
DINGTALK_CLIENT_SECRET=your-dingtalk-client-secret
RAG_API_URL=
```

如果你要启用意图分析的模型兜底，可以再按需补充这些可选项：

```env
SILICONFLOW_API_KEY=
SILICONFLOW_BASE_URL=
SILICONFLOW_MODEL=
```

这些变量只用于意图模型兜底，不是本地规则模式的必填项；不配置时，系统仍会按本地规则模式运行。

### 3. 启动本地服务

```bash
npm run dev
```

默认会启动 `Next.js` API 路由和一个最小调试页。  
如果 `3000` 被占用，Next.js 会自动切换到其他端口。

### 4. 启动钉钉 Stream 客户端

```bash
npm run stream:dev
```

这个命令会启动一个独立的长连接进程，用来接钉钉 `Stream Mode` 的消息；源码变更后会自动重启。

### 5. 当前可访问地址

调试页首页：

```text
http://localhost:3001
```

本地 API：

```text
/api/dingtalk/webhook
```

说明：

- 首页只用于确认服务已启动与查看调试入口
- `Stream Mode` 连接钉钉时，真正的消息入口不再依赖公网 webhook

---

## 🧠 当前能力

当前默认机器人已经能处理两类员工请求：

- 知识问答
  - 例如：`年假规则是什么`
- 事务办理
  - 例如：`我要请假`

内部主链路是：

```text
用户消息 -> 意图分析 -> 请求路由 -> 知识卡片 / 事务目录 / 转人工 -> 回复
```

当前验证时可以优先用这几句话：

- `年假规则是什么`
- `我要请假`
- `帮我找行政`
- `你好`

---

## 🗂️ 内容整理方式

当前项目的内容输入方式不是后台 CMS，而是：

```text
钉钉文档 -> 人工整理 -> Markdown 卡片 -> 研发接入
```

分成两类内容：

- 知识卡片
  - 用来回答“规则是什么、制度怎么规定”
- 事务目录
  - 用来回答“我要办什么、入口在哪里”

模板文档见：

[knowledge-card-template.md](/Users/xiemin/monter/dingtalk-admin-assistant/docs/knowledge-card-template.md)

建议第一批先整理：

- 每个部门 5 到 10 条高频知识
- 每个部门 2 到 5 个高频事务入口

---

## 🔗 钉钉接入说明

详细配置手册见：

[dingtalk-stream-setup.md](/Users/xiemin/monter/dingtalk-admin-assistant/docs/dingtalk-stream-setup.md)

这份手册包含：

- 钉钉后台怎么创建应用
- 如何开启 `Stream Mode`
- `Client ID / Client Secret` 去哪里拿
- 本地怎么启动
- 接入后怎么验证
- 常见失败场景怎么排查

---

## 🧭 当前开发入口

| 入口 | 作用 |
| --- | --- |
| `/` | 最小调试页，确认服务已启动 |
| `/api/dingtalk/webhook` | 本地调试 API 路由入口 |
| `npm run stream:dev` | 钉钉 Stream Mode 长连接入口，支持自动重启 |

当前架构是：

- `Next.js` 负责基础 API 和最小调试页
- `Stream client` 负责真正接钉钉消息
- `assistant runtime` 负责统一组装依赖
- `assistant service` 负责问答编排
- `request router` 负责知识 / 事务 / 转人工分流
- `knowledge card retriever` 负责本地知识命中
- `task catalog service` 负责事务入口命中

这样做的好处是：

- 页面壳子不再干扰机器人主链路
- 不需要把长连接塞进 `route.ts`
- webhook 与 stream 能共用同一套能力链路
- 后面接数据库或 RAG 时只改业务层，不推翻接入层
