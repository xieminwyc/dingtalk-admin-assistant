# 万事通首页三态工作台迭代 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有首页升级为 `home / drilldown / chat` 三态工作台，并引入左上角入口触发的历史抽屉、模式化结果层级和最小会话连续性。

**Architecture:** 继续复用现有 `/api/dingtalk/webhook`、assistant runtime 和 `entryMode` 协议，不引入新的后端业务入口。前端把当前单文件首页拆成 `HomeShell + HistoryDrawer + HomeCanvas + DrilldownCanvas + ChatCanvas + Composer` 组合，依旧以本地会话恢复和现有 router/reply-builder 为基础逐步增强，不提前建设完整历史中心或富结构卡片系统。

**Tech Stack:** Next.js App Router、React、TypeScript、Vitest、Testing Library、现有 assistant runtime / router / logging 模块

---

## Scope

本计划实现已批准的 spec：
[2026-03-31-homepage-immersive-v1.1.md](/Users/xiemin/monter/dingtalk-admin-assistant/docs/superpowers/specs/2026-03-31-homepage-immersive-v1.1.md)

本次实现聚焦：

- 首页三态工作台：`home / drilldown / chat`
- 左上角入口触发的历史抽屉
- 首页组件拆分与状态边界清晰化
- `chat` 结果层级、citation、错误态 / 澄清态 / 占位态
- 本地会话恢复与轻量会话摘要
- 移动端、可访问性、`/debug` 可观测性回归

本次不实现：

- 完整历史记录中心
- 多 Agent 切换系统
- 真实图片生成服务
- 数据库版持久化会话日志
- 复杂富结构消息 schema 或大型卡片组件库

## Scope Check

该 spec 的新增内容都属于同一个子项目：把首页从“可用的门户页”升级成“可持续使用的工作台”。不需要拆成多个独立计划，但必须按“壳层 / 历史 / 画布 / 回复层 / 回归”拆成可独立提交的任务，避免一次性重写整个首页。

## File Structure

| 路径 | 职责 |
| --- | --- |
| `src/app/page.tsx` | 首页入口，仅负责组装 `HomeShell` |
| `src/app/page.test.tsx` | 首页三态流转、抽屉开关、发送链路、会话恢复测试 |
| `src/app/home-config.ts` | 业务卡、模板、快捷标签、同事们、快捷入口配置 |
| `src/app/globals.css` | 三态工作台、抽屉、消息层级、移动端与焦点样式 |
| `src/app/_components/home-shell.tsx` | 顶部栏、主状态编排、当前会话选择 |
| `src/app/_components/history-drawer.tsx` | 历史抽屉、会话摘要列表、`开启新话题` |
| `src/app/_components/home-canvas.tsx` | `home` 视图：欢迎区、卡片网格、同事们、快捷入口 |
| `src/app/_components/drilldown-canvas.tsx` | `drilldown` 视图：模式头部、模板列表、返回首页 |
| `src/app/_components/chat-canvas.tsx` | `chat` 视图：消息流、citation、mode 标签、错误态 |
| `src/app/_components/composer.tsx` | 底部固定输入区 |
| `src/app/_components/home-shell.types.ts` | `HomeView`、`ConversationSummary`、前端 `ChatEntry` 契约 |
| `src/app/debug/page.tsx` | 调试页展示新状态与 debug 字段 |
| `src/app/debug/page.test.tsx` | 调试页的 debug 信息和 session 回归测试 |
| `src/app/api/dingtalk/webhook/route.ts` | 维持稳定 debug 字段结构 |
| `src/app/api/dingtalk/webhook/route.test.ts` | webhook debug 契约回归测试 |
| `src/modules/assistant/reply-builder.ts` | 兜底文本层级增强 |
| `src/modules/assistant/reply-builder.test.ts` | `knowledge / task / contact / clarification / placeholder` 文本层级测试 |
| `src/modules/assistant/assistant.types.ts` | 需要时补齐 citation / meta 返回契约 |
| `src/modules/router/request-router.ts` | mode-aware resolution 行为保持稳定 |
| `src/modules/router/request-router.test.ts` | 路由优先级和未命中回归 |
| `README.md` | 首页工作台现状与 `/debug` 路径说明 |
| `docs/superpowers/specs/2026-03-31-homepage-immersive-v1.1.md` | 本轮落地后更新“当前已完成” |

---

### Task 1: 拆出首页壳层与三态画布

**Files:**
- Create: `src/app/_components/home-shell.tsx`
- Create: `src/app/_components/home-canvas.tsx`
- Create: `src/app/_components/drilldown-canvas.tsx`
- Create: `src/app/_components/composer.tsx`
- Create: `src/app/_components/home-shell.types.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/app/page.test.tsx`

- [ ] **Step 1: Write the failing tests**

先在 `src/app/page.test.tsx` 增加三态流转的最小断言：

```ts
render(<Home />);
await user.click(screen.getByText("找制度"));
expect(screen.getByText("找制度专家模式")).toBeInTheDocument();
```

```ts
await user.click(
  screen.getByRole("button", { name: "PMS制卡问题应该找谁处理？" })
);
expect(screen.getByLabelText("输入消息")).toHaveValue(
  "PMS制卡问题应该找谁处理？"
);
```

```ts
await user.keyboard("{Enter}");
expect(screen.getByText("请联系门店系统支持同学处理 PMS 制卡问题。")).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/app/page.test.tsx`

Expected: FAIL，因为当前首页还没有 `home / drilldown / chat` 三态，点击卡片不会进入独立的 `drilldown` 画布。

- [ ] **Step 3: Write minimal implementation**

先只做最小壳层拆分：

- 在 `home-shell.types.ts` 定义：

```ts
export type HomeView = "home" | "drilldown" | "chat";

export type ChatEntry = {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: EntryMode | null;
  isThinking?: boolean;
  isError?: boolean;
};
```

- `page.tsx` 退化成：

```ts
export default function Home() {
  return <HomeShell />;
}
```

- `HomeShell` 持有 `view`、`activeEntryMode`、`draft`、`messages`、`isSending`
- `HomeCanvas` 只负责首页卡片
- `DrilldownCanvas` 只负责模式头部和模板列表
- `Composer` 保持底部固定输入

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/app/page.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/page.test.tsx src/app/_components/home-shell.tsx src/app/_components/home-canvas.tsx src/app/_components/drilldown-canvas.tsx src/app/_components/composer.tsx src/app/_components/home-shell.types.ts
git commit -m "feat: add homepage shell with three-state canvases"
```

---

### Task 2: 实现历史抽屉与会话摘要

**Files:**
- Create: `src/app/_components/history-drawer.tsx`
- Modify: `src/app/_components/home-shell.tsx`
- Modify: `src/app/_components/home-shell.types.ts`
- Modify: `src/app/page.test.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Write the failing tests**

在 `src/app/page.test.tsx` 增加历史抽屉行为断言：

```ts
render(<Home />);
await user.click(screen.getByRole("button", { name: /历史记录/i }));
expect(screen.getByText("开启新话题")).toBeInTheDocument();
```

```ts
window.localStorage.setItem(
  "homepage-session",
  JSON.stringify({
    currentSessionId: "home-1",
    sessions: [
      {
        sessionId: "home-1",
        title: "PMS制卡问题应该找谁处理？",
        updatedAt: Date.now(),
        messages: [{ id: "m1", role: "user", content: "PMS制卡问题应该找谁处理？" }]
      }
    ]
  })
);
render(<Home />);
await user.click(screen.getByRole("button", { name: /历史记录/i }));
expect(screen.getByText("PMS制卡问题应该找谁处理？")).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/app/page.test.tsx`

Expected: FAIL，因为当前没有历史抽屉，也没有轻量摘要列表。

- [ ] **Step 3: Write minimal implementation**

定义最小摘要结构：

```ts
export type ConversationSummary = {
  sessionId: string;
  title: string;
  updatedAt: number;
  isCurrent?: boolean;
};
```

在 `HomeShell` 中补充：

- `isHistoryOpen`
- `conversationSummaries`
- 本地存储恢复与写回逻辑

历史抽屉只提供：

- 最近 `5 - 10` 条摘要
- 当前会话高亮
- `开启新话题`

不要在这一步里加入搜索、删除、分组。

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/app/page.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/_components/history-drawer.tsx src/app/_components/home-shell.tsx src/app/_components/home-shell.types.ts src/app/page.test.tsx src/app/globals.css
git commit -m "feat: add homepage history drawer and session summaries"
```

---

### Task 3: 升级 `chat` 结果层级与 citation 展示

**Files:**
- Create: `src/app/_components/chat-canvas.tsx`
- Modify: `src/app/_components/home-shell.types.ts`
- Modify: `src/app/_components/home-shell.tsx`
- Modify: `src/app/page.test.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/modules/assistant/reply-builder.ts`
- Modify: `src/modules/assistant/reply-builder.test.ts`

- [ ] **Step 1: Write the failing tests**

先在 `src/modules/assistant/reply-builder.test.ts` 锁定 mode-aware 文本层级：

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

```ts
expect(
  buildAssistantReply({
    kind: "task",
    intent: "task_request",
    title: "请假申请",
    entry: "https://oa.example.com/tasks/leave",
    guidance: "办理前准备：请先确认请假日期"
  })
).toContain("https://oa.example.com/tasks/leave");
```

然后在 `src/app/page.test.tsx` 增加 `chat` 结果层级断言：

```ts
expect(screen.getByText("依据来源")).toBeInTheDocument();
expect(screen.getByText("KNOWLEDGE")).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/modules/assistant/reply-builder.test.ts src/app/page.test.tsx`

Expected: FAIL，因为当前 `chat` 呈现仍接近纯文本气泡，没有独立 citation / mode 层级。

- [ ] **Step 3: Write minimal implementation**

升级前端消息结构，但保持轻量：

```ts
export type ChatEntry = {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: EntryMode | null;
  isThinking?: boolean;
  isError?: boolean;
  citations?: {
    documentTitle: string;
    sourceUrl?: string;
  }[];
  meta?: {
    title?: string;
    scope?: string;
    contactName?: string;
    team?: string;
    entry?: string;
    actionHint?: string;
  };
};
```

实现时：

- `ChatCanvas` 负责消息渲染
- `reply-builder` 先把知识、流程、联系人兜底文本写得更有层级
- citation 区块只做轻量列表，不上复杂卡片系统

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/modules/assistant/reply-builder.test.ts src/app/page.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/_components/chat-canvas.tsx src/app/_components/home-shell.types.ts src/app/_components/home-shell.tsx src/app/page.test.tsx src/app/globals.css src/modules/assistant/reply-builder.ts src/modules/assistant/reply-builder.test.ts
git commit -m "feat: add layered chat results and citations"
```

---

### Task 4: 对齐配置、模板与 drilldown 内容

**Files:**
- Modify: `src/app/home-config.ts`
- Modify: `src/app/_components/home-canvas.tsx`
- Modify: `src/app/_components/drilldown-canvas.tsx`
- Modify: `src/app/page.test.tsx`
- Modify: `README.md`

- [ ] **Step 1: Write the failing tests**

在 `src/app/page.test.tsx` 加模板和文案一致性断言：

```ts
render(<Home />);
await user.click(screen.getByText("找制度"));
expect(screen.getByText("推荐查询方案")).toBeInTheDocument();
expect(screen.getByText("查询特定项目的验收结果")).toBeInTheDocument();
```

```ts
await user.click(screen.getByText("图片生成"));
expect(screen.getByText(/尚未上线|即将上线/)).toBeInTheDocument();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/app/page.test.tsx`

Expected: FAIL，因为当前 `home-config` 还没有围绕 `drilldown` 组织模板，图片占位态也未必在新三态下正确承接。

- [ ] **Step 3: Write minimal implementation**

在 `home-config.ts` 中把卡片配置升级到可驱动 `drilldown`：

```ts
export type HomeEntryTemplate = {
  label: string;
  prompt: string;
};

export type HomeEntryCard = {
  title: string;
  description: string;
  helper: string;
  exampleQuestion: string;
  entryMode: EntryMode;
  placeholder: string;
  quickTags: QuickTag[];
  templates?: HomeEntryTemplate[];
  isPlaceholder?: boolean;
};
```

要求：

- 模板数量控制在 `2 - 4`
- 文案只承诺当前真实能力
- 图片生成继续明确为占位态
- README 更新为“三态工作台 + 抽屉式历史”描述

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/app/page.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/home-config.ts src/app/_components/home-canvas.tsx src/app/_components/drilldown-canvas.tsx src/app/page.test.tsx README.md
git commit -m "docs: align homepage drilldown templates with supported flows"
```

---

### Task 5: 补齐移动端、可访问性与 `/debug` 回归

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/page.test.tsx`
- Modify: `src/app/debug/page.tsx`
- Modify: `src/app/debug/page.test.tsx`
- Modify: `src/app/api/dingtalk/webhook/route.ts`
- Modify: `src/app/api/dingtalk/webhook/route.test.ts`
- Modify: `docs/superpowers/specs/2026-03-31-homepage-immersive-v1.1.md`

- [ ] **Step 1: Write the failing tests**

先加 3 组最小回归断言：

1. 抽屉和发送按钮的可访问性：

```ts
expect(screen.getByRole("button", { name: /历史记录/i })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
```

2. `/debug` 可观测性：

```ts
expect(screen.getByText("resolution.kind")).toBeInTheDocument();
expect(screen.getByText("usedResponseGenerator")).toBeInTheDocument();
```

3. webhook debug 契约：

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

Run: `npm test -- --run src/app/page.test.tsx src/app/debug/page.test.tsx src/app/api/dingtalk/webhook/route.test.ts`

Expected: FAIL，或至少暴露出三态壳层、历史抽屉和 debug 返回之间的回归缺口。

- [ ] **Step 3: Write minimal implementation**

最小实现内容：

- 在 `globals.css` 补抽屉过渡、窄屏断点、焦点态和底部固定输入区样式
- 在首页保证抽屉按钮、模板按钮、发送按钮有清晰语义
- `/debug` 继续展示 intent / resolution / usedResponseGenerator，不因首页重构丢失观察能力
- 更新主 spec 的“当前已完成”部分，把已经落地的三态工作台内容前移

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `npm test -- --run src/app/page.test.tsx src/app/debug/page.test.tsx src/app/api/dingtalk/webhook/route.test.ts`

Expected: PASS

- [ ] **Step 5: Run broader regression**

Run: `npm test -- --run src/app/page.test.tsx src/app/debug/page.test.tsx src/app/api/dingtalk/webhook/route.test.ts src/modules/assistant/reply-builder.test.ts src/modules/router/request-router.test.ts src/modules/assistant/response-generator.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/app/page.test.tsx src/app/debug/page.tsx src/app/debug/page.test.tsx src/app/api/dingtalk/webhook/route.ts src/app/api/dingtalk/webhook/route.test.ts docs/superpowers/specs/2026-03-31-homepage-immersive-v1.1.md
git commit -m "feat: harden homepage workbench accessibility and debug coverage"
```

---

## Manual Verification Checklist

- [ ] 首页默认进入 `home`，展示欢迎区、五张卡、同事们和底部固定输入区
- [ ] 点击业务卡后进入 `drilldown`，而不是直接跳进聊天
- [ ] `drilldown` 中模板点击后默认只预填、不误发
- [ ] 发送后切到 `chat`，并展示思考态
- [ ] 左上角按钮可打开 / 关闭历史抽屉
- [ ] 历史抽屉能展示最近会话摘要和 `开启新话题`
- [ ] citation、mode 标签、错误态、澄清态、占位态都可在 `chat` 中区分
- [ ] 移动端下抽屉、主画布和底部输入区没有明显布局冲突
- [ ] `/debug` 仍能看到本轮的 intent / resolution / usedResponseGenerator

## Risks / Notes

- 当前 `ConversationLogRepository` 仍是内存实现，因此历史抽屉本轮优先使用前端本地会话恢复，而不是后端持久化历史
- 当前首页消息模型从纯字符串升级到轻量 meta/citation 后，前后端契约要保持渐进增强，避免一次改成复杂 schema
- `writing` 模式的表现仍依赖 response generator 是否启用，测试和手动验收都要接受保守退化场景
- 组件拆分应以职责清晰为先，不需要为了“组件化”而过度拆碎小文件

## Suggested Execution Order

1. Task 1：先把三态工作台壳层搭起来，锁定 `home / drilldown / chat`
2. Task 2：接着补历史抽屉和会话摘要，让工作台有“持续助手”感
3. Task 3：再做 `chat` 结果层级，避免界面骨架有了但结果还像旧聊天页
4. Task 4：对齐模板和内容配置，让 drilldown 真正有价值
5. Task 5：最后收口移动端、可访问性和 `/debug` 回归
