# 外部知识库 Ask 同步接口实施计划

> **给执行型智能体：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务逐步执行本计划。步骤使用 `- [ ]` 复选框语法跟踪。

**目标：** 将知识问答路由切换到最新的外部同步接口 `POST /api/v1/knowledge/ask`，同时保留会话映射和本地知识库回退能力。

**架构：** 保持现有 router 和 retriever 的边界不变。先更新 API Client 的请求/响应类型，再让外部 provider 根据 `answer` 与 `source` 组装现有内部 `KnowledgeHit` 结构，并维持超时回退逻辑不变。

**技术栈：** TypeScript、Vitest、基于 fetch 的 API Client

---

### 任务 1：先用失败测试锁定新的 ask 协议

**涉及文件：**
- 修改：`src/modules/assistant/create-assistant-runtime.test.ts`
- 测试：`src/modules/assistant/create-assistant-runtime.test.ts`

- [ ] **步骤 1：先写失败测试**

补充测试，验证 provider 面向外部同步 `/ask` 时：
- 能从响应字段 `answer`、`source`、`sessionId` 组装结果
- 请求体使用 `maxSources` 和 `excludeImageData`

- [ ] **步骤 2：运行测试，确认它先失败**

运行：`npm test -- src/modules/assistant/create-assistant-runtime.test.ts`
预期：FAIL，因为旧实现仍然假设返回 `sources` 或仍在使用旧请求字段。

- [ ] **步骤 3：编写最小实现**

更新 API Client 类型和 provider 映射逻辑，只满足新的同步协议，不顺带改动无关行为。

- [ ] **步骤 4：重新运行测试，确认通过**

运行：`npm test -- src/modules/assistant/create-assistant-runtime.test.ts`
预期：PASS

- [ ] **步骤 5：提交代码**

```bash
git add src/modules/assistant/create-assistant-runtime.test.ts src/modules/knowledge/knowledge-api-client.ts src/modules/assistant/create-assistant-runtime.ts
git commit -m "feat: align external rag ask integration"
```

### 任务 2：验证对知识路由敏感的回归行为

**涉及文件：**
- 修改：`src/modules/assistant/create-assistant-runtime.ts`
- 测试：`src/modules/assistant/create-assistant-runtime.test.ts`

- [ ] **步骤 1：补充失败测试**

补充或细化“超时回退”和“会话复用”测试，确保外部 provider 在切换协议后仍保持当前路由保障。

- [ ] **步骤 2：运行测试，确认失败**

运行：`npm test -- src/modules/assistant/create-assistant-runtime.test.ts`
预期：FAIL，失败原因为请求体或响应映射断言不匹配。

- [ ] **步骤 3：编写最小实现**

只调整 provider 的请求组装和会话映射逻辑，以最小改动让新测试通过。

- [ ] **步骤 4：重新运行测试，确认通过**

运行：`npm test -- src/modules/assistant/create-assistant-runtime.test.ts`
预期：PASS

- [ ] **步骤 5：提交代码**

```bash
git add src/modules/assistant/create-assistant-runtime.test.ts src/modules/assistant/create-assistant-runtime.ts
git commit -m "test: cover external rag ask fallback"
```

### 任务 3：做定向验证和知识模块回归验证

**涉及文件：**
- 测试：`src/modules/knowledge`
- 测试：`src/modules/assistant/create-assistant-runtime.test.ts`

- [ ] **步骤 1：运行定向测试**

运行：`npm test -- src/modules/knowledge/external-rag-retriever.test.ts src/modules/assistant/create-assistant-runtime.test.ts`
预期：PASS

- [ ] **步骤 2：运行更完整的知识模块验证**

运行：`npm test -- src/modules/knowledge src/modules/assistant/create-assistant-runtime.test.ts`
预期：PASS；如果失败，需要区分是否为本次改动引入，还是仓库原有的无关问题。
