# 首页知识问答 AskStream 接入实施计划

> **给执行型智能体：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务逐步执行本计划。步骤使用 `- [ ]` 复选框语法跟踪。

**目标：** 让首页 Web 聊天在知识问答场景优先走外部 `POST /api/v1/knowledge/ask/stream`，实现逐字流式输出，同时保留现有一次性兜底。

**架构：** 新增首页专用流式 API 路由，对知识问答直连外部 `askStream`，对其他模式包装成兼容的单次流式事件。前端改为消费流式事件并在 `done` 时补齐引用和图片。

**技术栈：** Next.js Route Handler、TypeScript、ReadableStream、Vitest

## 执行状态

- 状态：已完成实现，当前工作区未提交
- 实际新增/修改文件：
  - `src/app/api/dingtalk/webhook/stream/route.ts`
  - `src/app/api/dingtalk/webhook/stream/route.test.ts`
  - `src/app/_components/home-shell.tsx`
  - `src/app/_components/chat-canvas.tsx`
  - `src/app/_components/chat-canvas.test.tsx`
  - `src/app/globals.css`
  - `src/app/page.test.tsx`
  - `src/modules/assistant/create-assistant-runtime.ts`

---

### 任务 1：锁定流式 API 路由行为

**涉及文件：**
- 新建：`src/app/api/dingtalk/webhook/stream/route.ts`
- 新建：`src/app/api/dingtalk/webhook/stream/route.test.ts`

- [x] **步骤 1：先写失败测试**

补充测试，覆盖：
- 知识问答场景走外部 `askStream`
- 路由输出 `chunk` 和 `done` 事件
- `done` 中带上 `citations`、`images`、`kind`、`meta`

- [x] **步骤 2：运行测试，确认先失败**

运行：`npm test -- src/app/api/dingtalk/webhook/stream/route.test.ts`
预期：FAIL，因为流式路由尚未实现。

- [x] **步骤 3：编写最小实现**

新增流式路由，并把知识问答场景接到外部 `askStream`。

- [x] **步骤 4：重新运行测试，确认通过**

运行：`npm test -- src/app/api/dingtalk/webhook/stream/route.test.ts`
预期：PASS

### 任务 2：打通前端流式消费

**涉及文件：**
- 修改：`src/app/_components/home-shell.tsx`
- 修改：`src/app/_components/home-shell.types.ts`

- [x] **步骤 1：先写失败测试或补行为断言**

补前端或 API 层行为断言，确认 assistant 消息会随着 `chunk` 逐步更新，`done` 后挂载 `citations/images`。

- [x] **步骤 2：运行测试，确认失败**

运行：`npm test -- src/app/api/dingtalk/webhook/stream/route.test.ts`
预期：FAIL，原因是前端还未消费流式协议。

- [x] **步骤 3：编写最小实现**

把首页发送逻辑改为优先请求 `/api/dingtalk/webhook/stream`，逐步更新当前消息内容。

- [x] **步骤 4：重新运行测试，确认通过**

运行：`npm test -- src/app/api/dingtalk/webhook/stream/route.test.ts`
预期：PASS

### 任务 3：同步兜底与知识链路回归

**涉及文件：**
- 修改：`src/modules/assistant/create-assistant-runtime.ts`
- 修改：相关测试文件

- [x] **步骤 1：补失败测试**

覆盖：
- 流式失败退回同步回复
- 会话映射在流式 `done.sessionId` 后更新

- [x] **步骤 2：运行测试，确认失败**

运行：`npm test -- src/modules/assistant/create-assistant-runtime.test.ts src/app/api/dingtalk/webhook/stream/route.test.ts`
预期：FAIL

- [x] **步骤 3：编写最小实现**

补流式 provider 和兜底逻辑，不破坏现有同步 `/ask`。

- [x] **步骤 4：重新运行测试，确认通过**

运行：`npm test -- src/modules/assistant/create-assistant-runtime.test.ts src/app/api/dingtalk/webhook/stream/route.test.ts`
预期：PASS

### 任务 4：定向验证

**涉及文件：**
- 测试：`src/modules/assistant`
- 测试：`src/modules/knowledge`
- 测试：`src/app/api/dingtalk/webhook/route.test.ts`
- 测试：`src/app/api/dingtalk/webhook/stream/route.test.ts`

- [x] **步骤 1：运行流式与知识相关测试**

运行：`npm test -- src/modules/assistant src/modules/knowledge src/app/api/dingtalk/webhook/route.test.ts src/app/api/dingtalk/webhook/stream/route.test.ts`
预期：PASS

- [x] **步骤 2：必要时做一次首页手工联调**

验证首页知识问答是否具备打字机效果，并在结束后出现引用来源与图片。

## 实际补充结果

- 首页现在会把正文里的 `{{图N}}` 替换成内联图片卡片
- 当真实图片还没到达时，`{{图N}}` 会先显示“图片加载中”占位卡片，避免结束时突然闪现
- 已在正文里展示的图片不会再在底部图片区重复渲染

## 已执行验证

- `npm test -- src/app/api/dingtalk/webhook/stream/route.test.ts src/app/page.test.tsx src/modules/assistant/create-assistant-runtime.test.ts`
- `npm test -- src/app/page.test.tsx src/app/_components/chat-canvas.test.tsx`
