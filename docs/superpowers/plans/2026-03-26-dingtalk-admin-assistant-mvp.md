# 钉钉行政助手 MVP 实现计划

> **给代理式执行者：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务逐步执行本计划。所有步骤使用复选框 `- [ ]` 语法跟踪。

**目标：** 搭建一个独立的钉钉行政助手 MVP 项目，具备清晰的 Next.js 骨架、基于 FAQ 的问答流程、钉钉 webhook 入口，以及为未来 RAG 接入预留的可插拔检索接口。

**架构：** 该项目以独立的 Next.js + TypeScript 应用为起点，重点通过 API Routes 打通钉钉助手接入。第一版使用结构化 FAQ 检索与转人工规则，同时抽象统一的检索接口，让未来外部 RAG API 可以接入而不必重写整条 assistant 流程。

**技术栈：** Node.js、TypeScript、Next.js App Router、Prisma、PostgreSQL、dotenv、钉钉 AI 助理回调集成

---

## 📑 范围

本计划覆盖：

- 独立项目脚手架
- 后端应用骨架
- 钉钉 webhook 入口
- FAQ 检索流程
- 回复拼装
- 转人工规则
- 面向未来外部 RAG API 的检索抽象

本计划暂不覆盖：

- 生产部署
- 管理后台 CMS
- 完整钉钉卡片渲染
- 外部 RAG API 的实际集成实现

---

## 🧱 计划文件结构

| 路径 | 职责 |
| --- | --- |
| `package.json` | 项目脚本与依赖 |
| `tsconfig.json` | TypeScript 配置 |
| `src/app/layout.tsx` | App Router 布局 |
| `src/app/page.tsx` | 本地项目占位页 |
| `src/config/env.ts` | 环境变量解析 |
| `src/app/api/dingtalk/webhook/route.ts` | 钉钉回调入口 |
| `src/modules/assistant/assistant.service.ts` | assistant 编排层 |
| `src/modules/assistant/reply-builder.ts` | 最终回复格式拼装 |
| `src/modules/knowledge/retriever.types.ts` | 检索接口定义 |
| `src/modules/knowledge/faq-retriever.ts` | FAQ 检索实现 |
| `src/modules/handoff/handoff.service.ts` | 转人工规则判断 |
| `src/modules/knowledge/faq.repository.ts` | FAQ 数据访问 |
| `prisma/schema.prisma` | FAQ 与配置的数据模型 |
| `src/modules/assistant/*.test.ts` | 核心流程测试 |

---

### 任务 1：搭建独立项目骨架

**文件：**
- 创建：`package.json`
- 创建：`tsconfig.json`
- 创建：`.gitignore`
- 创建：`src/app/layout.tsx`
- 创建：`src/app/page.tsx`

- [ ] **步骤 1：先写失败的启动 smoke test**

创建一个简单的应用创建测试。

- [ ] **步骤 2：运行测试，确认先失败**

运行：`npm test`
预期：FAIL，因为项目文件和测试运行器还没准备好。

- [ ] **步骤 3：补最小项目配置**

添加以下脚本：

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "test": "vitest run"
}
```

- [ ] **步骤 4：补一个最小 Next.js 页面壳**

```ts
export default function Home() {
  return <main>DingTalk Admin Assistant</main>;
}
```

- [ ] **步骤 5：再次运行测试**

运行：`npm test`
预期：启动测试通过，或者暴露出下一层缺失模块。

- [ ] **步骤 6：提交**

```bash
git add package.json tsconfig.json .gitignore src/app/layout.tsx src/app/page.tsx
git commit -m "chore: scaffold admin assistant app"
```

---

### 任务 2：定义环境变量与配置边界

**文件：**
- 创建：`src/config/env.ts`
- 创建：`.env.example`
- 测试：`src/config/env.test.ts`

- [ ] **步骤 1：先写失败的配置测试**

测试以下必需或可选配置：

- server port
- 钉钉应用标识
- 数据库地址
- 可选外部 RAG 地址

- [ ] **步骤 2：运行目标测试**

运行：`npm test -- src/config/env.test.ts`
预期：FAIL，因为配置解析器还不存在。

- [ ] **步骤 3：实现类型化配置解析**

```ts
export type AppEnv = {
  port: number;
  databaseUrl: string;
  dingtalkClientId: string;
  dingtalkClientSecret: string;
  ragApiUrl?: string;
};
```

- [ ] **步骤 4：新增 `.env.example`**

补上钉钉和可选 RAG 配置的占位值。

- [ ] **步骤 5：重新运行配置测试**

运行：`npm test -- src/config/env.test.ts`
预期：PASS

- [ ] **步骤 6：提交**

```bash
git add src/config/env.ts src/config/env.test.ts .env.example
git commit -m "chore: add environment configuration"
```

---

### 任务 3：建模 FAQ 知识存储

**文件：**
- 创建：`prisma/schema.prisma`
- 创建：`src/modules/knowledge/faq.repository.ts`
- 测试：`src/modules/knowledge/faq.repository.test.ts`

- [ ] **步骤 1：先写失败的 repository 测试**

覆盖：

- 创建 FAQ 记录
- 按分类查询
- 按别名查询

- [ ] **步骤 2：运行 repository 测试**

运行：`npm test -- src/modules/knowledge/faq.repository.test.ts`
预期：FAIL，因为 repository 和 schema 还不存在。

- [ ] **步骤 3：定义最小 FAQ schema**

包含字段：

- question
- aliases
- answer
- scope
- steps
- exceptions
- handoffCondition
- owner
- updatedAt

- [ ] **步骤 4：实现 repository 方法**

例如：

```ts
findByExactQuestion(query: string)
findByAlias(query: string)
listQuickQuestions()
```

- [ ] **步骤 5：重新运行 repository 测试**

运行：`npm test -- src/modules/knowledge/faq.repository.test.ts`
预期：PASS

- [ ] **步骤 6：提交**

```bash
git add prisma/schema.prisma src/modules/knowledge/faq.repository.ts src/modules/knowledge/faq.repository.test.ts
git commit -m "feat: add faq repository"
```

---

### 任务 4：引入可插拔的检索抽象

**文件：**
- 创建：`src/modules/knowledge/retriever.types.ts`
- 创建：`src/modules/knowledge/faq-retriever.ts`
- 测试：`src/modules/knowledge/faq-retriever.test.ts`

- [ ] **步骤 1：先写失败的 retriever 测试**

覆盖：

- FAQ 成功命中
- 别名命中
- 无结果

- [ ] **步骤 2：运行 retriever 测试**

运行：`npm test -- src/modules/knowledge/faq-retriever.test.ts`
预期：FAIL

- [ ] **步骤 3：定义 retriever 接口**

```ts
export interface KnowledgeRetriever {
  search(query: string): Promise<KnowledgeHit[]>;
}
```

- [ ] **步骤 4：实现 FAQ retriever**

把 repository 结果映射成标准化的 `KnowledgeHit[]`。

- [ ] **步骤 5：重新运行 retriever 测试**

运行：`npm test -- src/modules/knowledge/faq-retriever.test.ts`
预期：PASS

- [ ] **步骤 6：提交**

```bash
git add src/modules/knowledge/retriever.types.ts src/modules/knowledge/faq-retriever.ts src/modules/knowledge/faq-retriever.test.ts
git commit -m "feat: add pluggable faq retriever"
```

---

### 任务 5：实现转人工规则与回复拼装器

**文件：**
- 创建：`src/modules/handoff/handoff.service.ts`
- 创建：`src/modules/assistant/reply-builder.ts`
- 测试：`src/modules/handoff/handoff.service.test.ts`
- 测试：`src/modules/assistant/reply-builder.test.ts`

- [ ] **步骤 1：先写失败的 handoff 和 reply formatting 测试**

覆盖：

- 清晰 FAQ 答案
- 带转人工提示的 FAQ 答案
- 未命中时的兜底

- [ ] **步骤 2：运行这些测试**

运行：`npm test -- src/modules/handoff/handoff.service.test.ts src/modules/assistant/reply-builder.test.ts`
预期：FAIL

- [ ] **步骤 3：实现 handoff 判断**

规则应支持：

- 低置信度
- 缺少适用范围
- 显式敏感类别

- [ ] **步骤 4：实现 reply builder**

输出结构包含：

- summary
- scope
- steps
- exceptions
- handoff

- [ ] **步骤 5：重新运行测试**

运行：`npm test -- src/modules/handoff/handoff.service.test.ts src/modules/assistant/reply-builder.test.ts`
预期：PASS

- [ ] **步骤 6：提交**

```bash
git add src/modules/handoff/handoff.service.ts src/modules/assistant/reply-builder.ts src/modules/handoff/handoff.service.test.ts src/modules/assistant/reply-builder.test.ts
git commit -m "feat: add handoff rules and reply builder"
```

---

### 任务 6：实现 assistant 编排服务

**文件：**
- 创建：`src/modules/assistant/assistant.service.ts`
- 测试：`src/modules/assistant/assistant.service.test.ts`

- [ ] **步骤 1：先写失败的编排测试**

覆盖：

- FAQ 命中流程
- 未命中兜底流程
- 通过 retriever 注入保留未来 provider 扩展能力

- [ ] **步骤 2：运行编排测试**

运行：`npm test -- src/modules/assistant/assistant.service.test.ts`
预期：FAIL

- [ ] **步骤 3：实现 assistant service**

该服务需要：

- 接收用户 query
- 调用 `KnowledgeRetriever`
- 判断是否 handoff
- 拼装最终回复

- [ ] **步骤 4：重新运行编排测试**

运行：`npm test -- src/modules/assistant/assistant.service.test.ts`
预期：PASS

- [ ] **步骤 5：提交**

```bash
git add src/modules/assistant/assistant.service.ts src/modules/assistant/assistant.service.test.ts
git commit -m "feat: add assistant orchestration service"
```

---

### 任务 7：新增钉钉 webhook 入口

**文件：**
- 创建：`src/app/api/dingtalk/webhook/route.ts`
- 测试：`src/app/api/dingtalk/webhook/route.test.ts`

- [ ] **步骤 1：先写失败的 webhook 测试**

覆盖：

- 合法请求能处理
- 非法 payload 被拒绝
- 返回 assistant 回复

- [ ] **步骤 2：运行 webhook 测试**

运行：`npm test -- src/modules/dingtalk/webhook.controller.test.ts`
预期：FAIL

- [ ] **步骤 3：实现 controller 与 route 注册**

路由需要：

- 解析钉钉回调 body
- 提取用户消息
- 调用 assistant service
- 返回 reply payload

- [ ] **步骤 4：重新运行 webhook 测试**

运行：`npm test -- src/modules/dingtalk/webhook.controller.test.ts`
预期：PASS

- [ ] **步骤 5：提交**

```bash
git add src/app/api/dingtalk/webhook/route.ts src/app/api/dingtalk/webhook/route.test.ts
git commit -m "feat: add dingtalk webhook entry"
```

---

### 任务 8：补充示例 FAQ 数据与快捷问题

**文件：**
- 创建：`prisma/seed.ts`
- 创建：`docs/sample-faq.md`
- 测试：`src/modules/knowledge/faq.repository.test.ts`

- [ ] **步骤 1：添加示例行政 FAQ**

包括：

- 请假怎么申请
- 补卡流程是什么
- 会议室怎么预订
- 电脑坏了找谁

- [ ] **步骤 2：补一个快捷问题数据契约**

暴露一个方法，给 assistant 首页提供快捷问题建议。

- [ ] **步骤 3：确认 repository 测试仍通过**

运行：`npm test`
预期：PASS

- [ ] **步骤 4：提交**

```bash
git add prisma/seed.ts docs/sample-faq.md
git commit -m "feat: add sample admin faq data"
```

---

### 任务 9：补充本地运行说明

**文件：**
- 修改：`README.md`
- 创建：`docs/local-dev.md`

- [ ] **步骤 1：写清安装与运行命令**

包含：

```bash
npm install
npm run dev
```

- [ ] **步骤 2：写清必需环境变量**

- [ ] **步骤 3：写清钉钉 webhook 本地调试方式**

- [ ] **步骤 4：提交**

```bash
git add README.md docs/local-dev.md
git commit -m "docs: add local development guide"
```

---

## ✅ 完成定义

当满足以下条件时，MVP 基础能力可视为就绪：

- 独立项目可在本地运行
- 钉钉 webhook 路由存在
- FAQ 检索可用
- reply builder 可用
- handoff 逻辑可用
- 外部 RAG 集成点已抽象出来且保持可选
