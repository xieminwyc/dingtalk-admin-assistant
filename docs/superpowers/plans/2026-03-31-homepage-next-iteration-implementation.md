# 万事通首页下一阶段迭代 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不推翻现有首页工作台架构的前提下，补强模式化回复呈现、最小会话连续性、首页内容真实性和移动端可用性，使首页进入“稳定可继续演进”的 P0 下一阶段。

**Architecture:** 继续复用现有首页 `src/app/page.tsx`、`/api/dingtalk/webhook` 和 assistant runtime 作为统一链路，不新增独立业务入口。前端优先补强工作台状态承接与展示层，后端补强 mode-aware 回复组织和 debug 可观测性，同时用测试兜住首页交互、路由契约和移动端样式回归。

**Tech Stack:** Next.js App Router、React、TypeScript、Vitest、Testing Library、现有 assistant runtime / router / logging 模块

---

## Scope

本计划实现已批准的 spec：
[2026-03-31-homepage-immersive-v1.1.md](/Users/xiemin/monter/dingtalk-admin-assistant/docs/superpowers/specs/2026-03-31-homepage-immersive-v1.1.md)

本次实现聚焦：

- 首页模式化回复的信息层级标准化
- 首页最小会话连续性增强
- `home-config` 与实际能力对齐
- 移动端与基础可访问性回归校验
- 文档与 debug 信息同步补强

本次不实现：

- 完整历史记录中心或抽屉
- 真实图片生成服务
- 多 Agent 切换逻辑
- 结构化复杂卡片系统
- 持久化数据库版会话日志

## Scope Check

该 spec 虽然包含多个“下一步”模块，但它们都服务于同一个子项目：让首页工作台从“已经能用”进入“可稳定继续开发”。因此本次保留单一实现计划，但按 4 个可独立提交的任务拆开，确保每一段都能单独验证和回归。

## File Structure

| 路径 | 职责 |
| --- | --- |
| `src/app/page.tsx` | 首页工作台的状态承接、消息呈现、模式化 UI 行为 |
| `src/app/page.test.tsx` | 首页模式化消息、会话恢复、错误态与移动端行为测试 |
| `src/app/home-config.ts` | 首页卡片文案、示例问题、快捷标签、同事们与快捷入口配置 |
| `src/app/globals.css` | 首页消息层级、模式块、移动端与焦点样式 |
| `src/app/api/dingtalk/webhook/route.ts` | 首页请求边界与 debug 返回契约 |
| `src/app/api/dingtalk/webhook/route.test.ts` | webhook debug 信息与请求协议回归测试 |
| `src/modules/assistant/assistant.types.ts` | resolution / debug 返回结构契约 |
| `src/modules/assistant/reply-builder.ts` | 非模型场景下的 mode-aware 回复兜底文案 |
| `src/modules/assistant/reply-builder.test.ts` | 各类 resolution 的文本层级测试 |
| `src/modules/assistant/response-generator.ts` | 模型生成时的 mode-aware 回复约束 |
| `src/modules/assistant/response-generator.test.ts` | 写作、知识、联系人、流程模式的提示词约束测试 |
| `src/modules/router/request-router.ts` | 入口模式与 resolution 种类映射 |
| `src/modules/router/request-router.test.ts` | mode 路由与未命中兜底测试 |
| `src/modules/logging/conversation-log.repository.ts` | 会话日志的当前内存实现边界 |
| `src/modules/logging/conversation-context.service.ts` | 最近上下文加载逻辑 |
| `src/app/debug/page.tsx` | 调试页对首页能力增强后的可观测性承接 |
| `src/app/debug/page.test.tsx` | 调试页显示 debug 字段的回归测试 |
| `README.md` | 首页定位、调试页、当前能力范围说明 |
| `docs/superpowers/specs/2026-03-31-homepage-immersive-v1.1.md` | 主规格同步更新“已完成”部分 |

---

### Task 1: 标准化首页模式化回复呈现

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/page.test.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/modules/assistant/reply-builder.ts`
- Modify: `src/modules/assistant/reply-builder.test.ts`

- [ ] **Step 1: Write the failing tests**

先在 `src/modules/assistant/reply-builder.test.ts` 增加 3 个最小断言，锁定 mode-aware 回复层级：

```ts
expect(
  buildAssistantReply({
    kind: "contact",
    intent: "handoff_request",
    title: "PMS 制卡问题",
    contactName: "门店系统支持同学",
    team: "信息平台主管组",
    description: "负责门店系统制卡异常排查",
    actionHint: "建议先附上门店名称和报错截图"
  })
).toContain("门店系统支持同学");
```

```ts
expect(
  buildAssistantReply({
    kind: "task",
    intent: "task_request",
    title: "请假申请",
    entry: "https://oa.example.com/tasks/leave",
    guidance: "办理前准备：请先确认请假日期",
    availability: "available"
  })
).toContain("https://oa.example.com/tasks/leave");
```

```ts
expect(
  buildAssistantReply({
    kind: "knowledge",
    intent: "knowledge_query",
    title: "年假制度",
    answer: "满一年可享受年假",
    scope: "以制度原文为准",
    referenceLabel: "《假勤管理办法》"
  })
).toContain("《假勤管理办法》");
```

然后在 `src/app/page.test.tsx` 补一个首页渲染断言：

```ts
expect(screen.getByText("《假勤管理办法》")).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/modules/assistant/reply-builder.test.ts src/app/page.test.tsx`

Expected: FAIL，因为当前首页消息气泡还没有针对信息层级做专门呈现，测试中的新断言不会全部满足。

- [ ] **Step 3: Write minimal implementation**

实现最小改动：

- 让 `reply-builder` 统一输出更有层级的文本块
- 在 `src/app/page.tsx` 为助手消息增加 mode-friendly 呈现容器，不改成复杂卡片系统
- 在 `src/app/globals.css` 为引用、入口链接、提示块增加轻量样式

推荐呈现结构：

```ts
type ChatEntry = {
  id: string;
  role: "user" | "assistant";
  content: string;
  isThinking?: boolean;
};
```

保持 `content` 仍是字符串，只在前端按段落和换行增强可读性，避免过早引入新的复杂消息 schema。

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/modules/assistant/reply-builder.test.ts src/app/page.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/page.test.tsx src/app/globals.css src/modules/assistant/reply-builder.ts src/modules/assistant/reply-builder.test.ts
git commit -m "feat: standardize homepage mode-aware replies"
```

---

### Task 2: 增强首页最小会话连续性

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/page.test.tsx`
- Modify: `src/app/debug/page.tsx`
- Modify: `src/app/debug/page.test.tsx`

- [ ] **Step 1: Write the failing tests**

在 `src/app/page.test.tsx` 先锁定两个连续性行为：

```ts
window.localStorage.setItem(
  "homepage-session",
  JSON.stringify({
    sessionId: "home-keep-1",
    messages: [
      { id: "assistant-1", role: "assistant", content: "这是上次的回复" }
    ]
  })
);

render(<Home />);

expect(screen.getByText("这是上次的回复")).toBeInTheDocument();
```

```ts
await user.click(screen.getByRole("button", { name: /退出模式/i }));
expect(screen.getByLabelText("输入消息")).toHaveAttribute(
  "placeholder",
  "输入你想问的问题，或让我帮你写点什么"
);
```

在 `src/app/debug/page.test.tsx` 增加一条断言，确保 debug 页仍保留单独 session，不受首页 local storage 逻辑污染：

```ts
expect(screen.getByText(/Session: debug-/)).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/app/page.test.tsx src/app/debug/page.test.tsx`

Expected: FAIL，因为首页当前不会从本地恢复消息，也没有测试覆盖退出模式后的默认态恢复。

- [ ] **Step 3: Write minimal implementation**

用最小前端状态持久化实现连续性：

- 首屏从 `localStorage` 恢复 `sessionId`、最近消息和当前模式
- 每次消息变更后同步写回本地
- 提供一个明确的新话题入口，至少能清空本地消息并生成新的 `sessionId`

推荐本地结构：

```ts
type StoredHomepageSession = {
  sessionId: string;
  messages: ChatEntry[];
  activeEntryMode: EntryMode | null;
};
```

注意事项：

- 只在浏览器端访问 `localStorage`
- 不把 debug 页并入同一个存储 key
- 不尝试在这一任务里接后端持久化历史

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/app/page.test.tsx src/app/debug/page.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/page.test.tsx src/app/debug/page.tsx src/app/debug/page.test.tsx
git commit -m "feat: preserve homepage session continuity"
```

---

### Task 3: 校准首页内容配置与实际能力范围

**Files:**
- Modify: `src/app/home-config.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/app/page.test.tsx`
- Modify: `README.md`

- [ ] **Step 1: Write the failing tests**

在 `src/app/page.test.tsx` 补一组“配置与展示一致性”断言：

```ts
expect(screen.getByText("快速定位制度依据")).toBeInTheDocument();
expect(screen.getByText("快速找到负责同事")).toBeInTheDocument();
expect(screen.getByText("直接带你去入口")).toBeInTheDocument();
```

再加一条针对“图片生成占位不是假能力”的断言：

```ts
await user.click(screen.getByText("图片生成"));
expect(screen.getByText(/即将上线/)).toBeInTheDocument();
```

在 `README.md` 相关段落增加对首页现状的检视点，先写一个最小快照断言或字符串包含断言（如果当前 README 测试为空，则在本任务中不加自动化测试，只保留手动校验步骤）。

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/app/page.test.tsx`

Expected: FAIL，或部分断言失败，因为当前文案、提示和 README 未必已完全同步到新的主规格措辞。

- [ ] **Step 3: Write minimal implementation**

用最小改动统一首页内容：

- 调整 `homeEntryCards` 的 `description`、`helper`、`exampleQuestion`，让它们只承诺真实已支持的能力
- 检查 `recommendedTeammates` 与 `quickLinks`，去掉会误导成已接通功能的文案
- 在 `README.md` 明确说明首页是门户工作台，图片生成仍为占位，调试页单独保留

建议准则：

- 不承诺真实图片结果
- 不把“同事们”写成已经可切换的多 Agent 平台
- 不使用明显 demo/营销化但无落地能力支撑的措辞

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/app/page.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/home-config.ts src/app/page.tsx src/app/page.test.tsx README.md
git commit -m "docs: align homepage content with supported capabilities"
```

---

### Task 4: 补齐移动端、可访问性与 debug 可观测性回归

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/page.tsx`
- Modify: `src/app/page.test.tsx`
- Modify: `src/app/api/dingtalk/webhook/route.ts`
- Modify: `src/app/api/dingtalk/webhook/route.test.ts`
- Modify: `src/app/debug/page.tsx`
- Modify: `src/app/debug/page.test.tsx`
- Modify: `docs/superpowers/specs/2026-03-31-homepage-immersive-v1.1.md`

- [ ] **Step 1: Write the failing tests**

补 3 组最小回归断言：

1. 首页可访问性：

```ts
expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
```

配合发送中场景，确认禁用态仍可被语义查询到。

2. debug 信息：

```ts
expect(screen.getByText("resolution.kind")).toBeInTheDocument();
expect(screen.getByText("usedResponseGenerator")).toBeInTheDocument();
```

3. webhook debug 返回：

```ts
expect(payload.debug).toEqual(
  expect.objectContaining({
    intent: expect.any(Object),
    resolution: expect.any(Object),
    usedResponseGenerator: expect.any(Boolean)
  })
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/app/page.test.tsx src/app/api/dingtalk/webhook/route.test.ts src/app/debug/page.test.tsx`

Expected: FAIL，或至少有回归缺口暴露出来，因为当前首页与 debug 页对增强后的状态和字段没有完整兜底。

- [ ] **Step 3: Write minimal implementation**

最小实现内容：

- 在 `globals.css` 为首页卡片、模式面板、消息区补窄屏断点和明显焦点态
- 在首页保证发送按钮、模式退出按钮、示例问题按钮都有清晰可聚焦语义
- 在 webhook debug 分支保持稳定字段结构
- 在 debug 页把关键字段展示完整，便于后续排查首页路由行为
- 更新主 spec 的“当前已完成”部分，把本轮已落地项前移

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/app/page.test.tsx src/app/api/dingtalk/webhook/route.test.ts src/app/debug/page.test.tsx`

Expected: PASS

- [ ] **Step 5: Run broader regression**

Run: `npm test -- --run src/app/page.test.tsx src/app/debug/page.test.tsx src/app/api/dingtalk/webhook/route.test.ts src/modules/assistant/reply-builder.test.ts src/modules/router/request-router.test.ts src/modules/assistant/response-generator.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/app/page.tsx src/app/page.test.tsx src/app/api/dingtalk/webhook/route.ts src/app/api/dingtalk/webhook/route.test.ts src/app/debug/page.tsx src/app/debug/page.test.tsx docs/superpowers/specs/2026-03-31-homepage-immersive-v1.1.md
git commit -m "feat: harden homepage accessibility and debug observability"
```

---

## Manual Verification Checklist

- [ ] 首页默认空态仍展示欢迎区、五张卡、同事们和输入框
- [ ] 点击任意卡片后模式面板出现，placeholder 变化正确
- [ ] 点击示例问题或快捷标签后只预填、不自动发送
- [ ] 发送后显示思考态，完成后正确替换为回复
- [ ] 刷新页面后最近会话仍能恢复
- [ ] 图片生成卡仍明确显示“即将上线”，不伪装成真实能力
- [ ] 窄屏下卡片、模式面板和输入区不发生明显错位
- [ ] `/debug` 仍能看到本轮的 intent / resolution / usedResponseGenerator

## Risks / Notes

- 当前 `ConversationLogRepository` 是内存实现，因此“最小连续性增强”优先走前端恢复而不是服务端历史
- 如果后续要做真正的历史记录模块，应先把日志仓库替换为可持久化实现，再讨论首页历史抽屉
- 当前首页消息模型仍是字符串内容；在没有充分证据前，不建议这轮就升级成复杂富结构消息 schema
- `writing` 模式的提升效果依赖 response generator 启用情况，调试和无模型环境下要接受保守退化

## Suggested Execution Order

1. Task 1：先把回复层级做实，避免后面所有演示都还是“有模式入口但回复像同一种话”
2. Task 2：再补会话连续性，让首页工作台真正有“持续助手”的感觉
3. Task 3：统一配置与 README，消除文案和实际能力错位
4. Task 4：最后做可访问性、移动端与 debug 回归，把边缘问题收口
