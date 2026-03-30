# 万事通首页与同页工作台 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前首页从调试聊天页重构为“万事通”正式 H5 工作台，并保留 `/debug` 调试入口，同时接通找制度、找对接人、找流程、帮我写作和图片生成占位这五个首页入口。

**Architecture:** 继续复用现有 `/api/dingtalk/webhook` 与 `assistant.service` 作为统一请求入口，在请求体中增加 `entryMode` 作为首页入口提示；后端新增轻量联系人目录 provider，并在路由层优先参考 `entryMode` 决定走知识、联系人、事务、写作或图片占位路径。前端把 `/` 改造成同页工作台，并将原调试页迁移到 `/debug`。

**Tech Stack:** Next.js App Router、React、TypeScript、Vitest、Testing Library、现有 assistant runtime/router 模块

---

## Scope

本计划实现已批准的 spec：
[2026-03-30-lingxi-assistant-homepage-design.md](/Users/xiemin/monter/dingtalk-admin-assistant/docs/superpowers/specs/2026-03-30-lingxi-assistant-homepage-design.md)

本次实现包含：

- 首页 `/` 改造成“万事通”正式 H5 门户
- 当前调试聊天页迁移到 `/debug`
- 首页五张业务卡与同页聊天区
- 请求协议新增 `entryMode`
- 新增本地联系人目录能力
- `图片生成` 占位回复
- `帮我写作` 的写作模式提示
- “AI 正在思考...”的伪流式状态

本次不实现：

- 真实图片生成服务
- 接钉钉真实组织架构
- 真正的流式协议

## File Structure

| 路径 | 职责 |
| --- | --- |
| `src/app/page.tsx` | 正式万事通首页与同页聊天工作台 |
| `src/app/page.test.tsx` | 首页业务卡、示例问题、思考态、请求协议测试 |
| `src/app/debug/page.tsx` | 迁移后的调试聊天页 |
| `src/app/debug/page.test.tsx` | 调试页渲染与原有调试交互测试 |
| `src/app/globals.css` | 首页与调试页的全局样式 |
| `src/app/home-config.ts` | 首页五张卡、推荐角色、快捷入口等静态配置 |
| `src/app/api/dingtalk/webhook/route.ts` | 读取并透传 `entryMode` |
| `src/app/api/dingtalk/webhook/route.test.ts` | 验证 `entryMode` 请求协议与 debug 分支不回归 |
| `src/modules/assistant/assistant.service.ts` | 让 `entryMode` 进入主编排链路 |
| `src/modules/assistant/assistant.service.test.ts` | 首页入口模式与生成回复的编排测试 |
| `src/modules/assistant/assistant.types.ts` | 新的联系人结果与入口模式契约 |
| `src/modules/assistant/reply-builder.ts` | 联系人结果与图片占位的兜底文本 |
| `src/modules/assistant/reply-builder.test.ts` | 联系人与占位回复测试 |
| `src/modules/assistant/response-generator.ts` | 写作模式系统提示扩展 |
| `src/modules/assistant/response-generator.test.ts` | `writing` 模式提示词测试 |
| `src/modules/router/request-router.ts` | 优先参考 `entryMode` 的知识/联系人/事务/占位路由 |
| `src/modules/router/request-router.test.ts` | 入口模式路由优先级测试 |
| `src/modules/contacts/contact-directory.types.ts` | 联系人目录契约 |
| `src/modules/contacts/contact-directory.service.ts` | 联系人目录匹配逻辑 |
| `src/modules/contacts/contact-directory.service.test.ts` | 联系人目录解析测试 |
| `src/modules/contacts/sample-contact-directory.ts` | 首版静态联系人种子数据 |
| `src/modules/assistant/create-assistant-runtime.ts` | 组装联系人目录服务 |
| `docs/dingtalk-stream-setup.md` | 补充正式首页与 `/debug` 调试路径说明 |

---

### Task 1: 定义首页入口模式与后端结果契约

**Files:**
- Create: `src/modules/assistant/entry-mode.types.ts`
- Modify: `src/modules/assistant/assistant.types.ts`
- Modify: `src/modules/assistant/assistant.service.ts`
- Modify: `src/modules/assistant/assistant.service.test.ts`
- Modify: `src/app/api/dingtalk/webhook/route.ts`
- Modify: `src/app/api/dingtalk/webhook/route.test.ts`
- Test: `src/modules/assistant/reply-builder.test.ts`

- [ ] **Step 1: Write the failing tests**

在 `src/modules/assistant/assistant.service.test.ts` 和 `src/app/api/dingtalk/webhook/route.test.ts` 里补这两个最小断言：

```ts
await assistant.reply({
  query: "帮我写一份周报",
  sessionId: "s-1",
  entryMode: "writing"
});

expect(analyzer.analyze).toHaveBeenCalledWith(
  expect.objectContaining({
    query: "帮我写一份周报",
    entryMode: "writing"
  })
);
```

```ts
await POST(
  new Request("http://localhost/api/dingtalk/webhook", {
    method: "POST",
    body: JSON.stringify({
      sessionId: "home-1",
      entryMode: "task",
      text: { content: "帮我打开 OA" }
    })
  })
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/modules/assistant/assistant.service.test.ts src/app/api/dingtalk/webhook/route.test.ts`

Expected: FAIL，因为当前输入结构还没有 `entryMode`，route 也不会透传它。

- [ ] **Step 3: Write minimal implementation**

补最小契约：

```ts
export type EntryMode =
  | "knowledge"
  | "contact"
  | "task"
  | "image_placeholder"
  | "writing";
```

并让这些位置透传它：

- `AssistantReplyInput`
- analyzer 输入
- webhook request body

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/modules/assistant/assistant.service.test.ts src/app/api/dingtalk/webhook/route.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/assistant/entry-mode.types.ts src/modules/assistant/assistant.types.ts src/modules/assistant/assistant.service.ts src/modules/assistant/assistant.service.test.ts src/app/api/dingtalk/webhook/route.ts src/app/api/dingtalk/webhook/route.test.ts
git commit -m "feat: add homepage entry mode contract"
```

---

### Task 2: 新增联系人目录能力

**Files:**
- Create: `src/modules/contacts/contact-directory.types.ts`
- Create: `src/modules/contacts/sample-contact-directory.ts`
- Create: `src/modules/contacts/contact-directory.service.ts`
- Create: `src/modules/contacts/contact-directory.service.test.ts`
- Modify: `src/modules/assistant/create-assistant-runtime.ts`

- [ ] **Step 1: Write the failing test**

在 `src/modules/contacts/contact-directory.service.test.ts` 先覆盖两个行为：

```ts
expect(
  service.resolve({ query: "PMS制卡问题应该找谁处理？" })
).toEqual(
  expect.objectContaining({
    title: "PMS 制卡问题",
    contactName: "门店系统支持同学"
  })
);
```

```ts
expect(
  service.resolve({ query: "人力资源相关的同事是谁？" })
).toEqual(
  expect.objectContaining({
    team: "HR"
  })
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/modules/contacts/contact-directory.service.test.ts`

Expected: FAIL，因为联系人目录模块还不存在。

- [ ] **Step 3: Write minimal implementation**

实现一个只做静态关键词匹配的联系人目录：

```ts
type ContactDirectoryItem = {
  id: string;
  title: string;
  keywords: string[];
  contactName: string;
  team?: string;
  description: string;
  actionHint?: string;
};
```

`sample-contact-directory.ts` 至少放入：

- PMS 制卡问题
- 人力资源相关咨询
- OA/流程系统问题

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/modules/contacts/contact-directory.service.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/contacts/contact-directory.types.ts src/modules/contacts/sample-contact-directory.ts src/modules/contacts/contact-directory.service.ts src/modules/contacts/contact-directory.service.test.ts src/modules/assistant/create-assistant-runtime.ts
git commit -m "feat: add contact directory service"
```

---

### Task 3: 让路由层支持联系人、写作模式和图片占位

**Files:**
- Modify: `src/modules/router/request-router.ts`
- Modify: `src/modules/router/request-router.test.ts`
- Modify: `src/modules/assistant/assistant.types.ts`
- Modify: `src/modules/assistant/reply-builder.ts`
- Modify: `src/modules/assistant/reply-builder.test.ts`
- Modify: `src/modules/assistant/response-generator.ts`
- Modify: `src/modules/assistant/response-generator.test.ts`

- [ ] **Step 1: Write the failing tests**

在 `src/modules/router/request-router.test.ts` 覆盖这三个入口优先级：

```ts
await expect(
  router.route({
    query: "帮我写一份项目周报",
    entryMode: "writing",
    intent: openResponseIntent
  })
).resolves.toEqual(
  expect.objectContaining({ kind: "open_response" })
);
```

```ts
await expect(
  router.route({
    query: "PMS制卡问题应该找谁处理？",
    entryMode: "contact",
    intent: clarifyIntent
  })
).resolves.toEqual(
  expect.objectContaining({ kind: "contact" })
);
```

```ts
await expect(
  router.route({
    query: "画一幅江南春景图",
    entryMode: "image_placeholder",
    intent: openResponseIntent
  })
).resolves.toEqual(
  expect.objectContaining({ kind: "open_response", reply: expect.stringContaining("即将支持") })
);
```

在 `src/modules/assistant/response-generator.test.ts` 验证 `writing` 模式会追加写作提示，例如：

```ts
expect(requestBody.messages[0].content).toContain("企业写作");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/modules/router/request-router.test.ts src/modules/assistant/reply-builder.test.ts src/modules/assistant/response-generator.test.ts`

Expected: FAIL，因为当前 router 不认识联系人和图片占位，也没有写作模式提示。

- [ ] **Step 3: Write minimal implementation**

实现最小行为：

- 新增 `AssistantContactResolution`
- `entryMode === "contact"` 时优先走联系人目录
- `entryMode === "image_placeholder"` 时直接返回固定占位回复
- `entryMode === "writing"` 时仍走 `open_response`，但给 `response-generator` 增加写作模式提示

联系人兜底回复至少包含：

```ts
["对接建议", contactName, description, actionHint].filter(Boolean).join("\n");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/modules/router/request-router.test.ts src/modules/assistant/reply-builder.test.ts src/modules/assistant/response-generator.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/router/request-router.ts src/modules/router/request-router.test.ts src/modules/assistant/assistant.types.ts src/modules/assistant/reply-builder.ts src/modules/assistant/reply-builder.test.ts src/modules/assistant/response-generator.ts src/modules/assistant/response-generator.test.ts
git commit -m "feat: support homepage entry mode routing"
```

---

### Task 4: 将当前调试页迁移到 `/debug`

**Files:**
- Create: `src/app/debug/page.tsx`
- Create: `src/app/debug/page.test.tsx`
- Modify: `src/app/page.test.tsx`

- [ ] **Step 1: Write the failing test**

先新增 `src/app/debug/page.test.tsx`，至少保留原首页测试的这两个断言：

```ts
render(<DebugPage />);
expect(screen.getByText("网页调试聊天")).toBeInTheDocument();
expect(screen.getByText("本轮调试信息")).toBeInTheDocument();
```

同时把 `src/app/page.test.tsx` 改成未来正式首页的最小断言：

```ts
render(<Home />);
expect(screen.getByText("找制度")).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/app/debug/page.test.tsx src/app/page.test.tsx`

Expected: FAIL，因为 `/debug` 页面还不存在，而首页还是旧调试页。

- [ ] **Step 3: Write minimal implementation**

把当前 `src/app/page.tsx` 的调试实现迁移到 `src/app/debug/page.tsx`，保留：

- 调试聊天
- session 显示
- debug 面板

首页本身先只保留一个最小占位壳子，保证路由迁移完成。

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/app/debug/page.test.tsx src/app/page.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/debug/page.tsx src/app/debug/page.test.tsx src/app/page.test.tsx
git commit -m "refactor: move debug chat page to debug route"
```

---

### Task 5: 构建正式万事通首页与同页聊天区

**Files:**
- Create: `src/app/home-config.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/app/page.test.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Write the failing tests**

在 `src/app/page.test.tsx` 至少覆盖这些用户可见行为：

```ts
render(<Home />);
expect(screen.getByText("找制度")).toBeInTheDocument();
expect(screen.getByText("找对接人")).toBeInTheDocument();
expect(screen.getByText("找流程")).toBeInTheDocument();
expect(screen.getByText("图片生成")).toBeInTheDocument();
expect(screen.getByText("帮我写作")).toBeInTheDocument();
```

```ts
await user.click(screen.getByText("PMS制卡问题应该找谁处理？"));
expect(globalThis.fetch).toHaveBeenCalledWith(
  "/api/dingtalk/webhook",
  expect.objectContaining({
    body: expect.stringContaining("\"entryMode\":\"contact\"")
  })
);
```

```ts
await user.type(screen.getByLabelText("输入消息"), "帮我写一份周报{enter}");
expect(screen.getByText("AI 正在思考...")).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/app/page.test.tsx`

Expected: FAIL，因为首页仍不是正式门户，也没有五张卡和思考态。

- [ ] **Step 3: Write minimal implementation**

实现正式首页：

- 用 `home-config.ts` 承载五张卡、推荐同事和快捷入口
- 头部文案改为“万事通”
- 点击卡片只切换当前模式并聚焦输入框
- 点击示例问题直接发起请求
- 发送后先插入：

```ts
{
  id: "assistant-thinking",
  role: "assistant",
  content: "AI 正在思考..."
}
```

- 接口返回后用正式回复替换思考态

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/app/page.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/home-config.ts src/app/page.tsx src/app/page.test.tsx src/app/globals.css
git commit -m "feat: build wantshitong homepage workbench"
```

---

### Task 6: 补运行文档并做全量验证

**Files:**
- Modify: `docs/dingtalk-stream-setup.md`

- [ ] **Step 1: Write the failing docs check**

列出必须出现在文档里的两条说明：

- 正式首页现在在 `/`
- 调试页面现在在 `/debug`

- [ ] **Step 2: Run verification commands before editing**

Run: `npm test -- --run src/app/page.test.tsx src/app/debug/page.test.tsx src/modules/router/request-router.test.ts src/modules/contacts/contact-directory.service.test.ts src/modules/assistant/assistant.service.test.ts src/app/api/dingtalk/webhook/route.test.ts`

Expected: PASS，确认前面改动已经稳定，然后再补文档。

- [ ] **Step 3: Write minimal documentation**

在 `docs/dingtalk-stream-setup.md` 增加一个短章节，说明：

- 如何打开正式首页
- 如何打开 `/debug` 调试页
- 首页五张卡与 `entryMode` 的对应关系

- [ ] **Step 4: Run full verification**

Run: `npm test`

Expected: PASS with 0 failing tests

- [ ] **Step 5: Commit**

```bash
git add docs/dingtalk-stream-setup.md
git commit -m "docs: update homepage and debug workflow"
```

---

## Review Notes

- 该计划按“先契约与路由，再页面迁移，最后首页 UI”的顺序拆分，避免同时改动前后端后失去回归锚点。
- `图片生成` 被明确限制为占位模式，防止本轮需求失控。
- 首页视觉尽量贴近参考图，但不在计划里引入新的设计系统或额外组件库。
- 按当前会话限制，本计划由主会话自审，不派发独立 reviewer 子代理。
