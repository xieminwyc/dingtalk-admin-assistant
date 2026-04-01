# RAG 超时问题进度同步

> 更新日期：2026-04-01
> 基线版本：已同步 `origin/main` 最新提交 `df228da`
> 当前状态：远端新能力已拉取，本地 RAG 超时治理仍在进行中

## 1. 本次同步结论

当前仓库已经完成两部分内容的叠加：

1. 已合入远端 `main` 的 `open_response` 单次调用直返优化
2. 已保留本地工作区中与外部 RAG、会话透传、超时降级相关的改动

这意味着当前分支不是“只拉了远端”，也不是“只有本地修超时”，而是两者都在。

## 2. 已同步的远端进展

本次从远端拉下来的核心内容是 `open_response` 直返优化，目标是让纯聊天类请求少走一次模型调用。

已落地内容：

- `assistant.service` 已支持 `open_response + reply` 的快速返回路径
- 相关测试和设计文档已补齐
- 对开放聊天场景的链路速度做了专项优化

对应文档：

- `docs/superpowers/specs/2026-04-01-chat-direct-reply-speedup-design.md`
- `docs/superpowers/plans/2026-04-01-chat-direct-reply-speedup-implementation.md`

## 3. 当前工作区中的本地进展

围绕“外部 RAG 超时后如何稳定退化”这条线，当前已完成的本地改动主要有：

### 3.1 外部知识检索的会话与用户透传

- `request-router` 已支持把 `userId`、`sessionId` 继续往下传
- `stream-handler` 和 webhook 入口已开始透传钉钉侧的用户标识和会话标识
- `external-rag-retriever` 与 `retriever.types` 已补齐对应参数

目的：

- 让外部知识库具备基于用户身份做 ACL 过滤的能力
- 让多轮对话能够复用外部 RAG 的 session

### 3.2 外部 RAG 失败时的本地兜底

- `request-router` 已恢复“外部优先，本地兜底”的策略
- 外部 RAG 报错、空结果、低置信度时，会回退本地知识检索
- 本地或外部命中分数过低时，会继续走澄清而不是硬答

这次修掉的核心问题是：

- 之前外部 RAG 超时会被伪装成“未找到内容”
- 现在超时会被识别为外部失败，并回退到本地知识

### 3.3 外部 RAG 直答结果的回复方式调整

- `assistant.types` 为知识型 resolution 增加了 `source`
- `assistant.service` 在命中 `source === "rag"` 时会跳过内部 `responseGenerator`
- `reply-builder` 对外部 RAG 结果采用更接近原答复的输出方式，不再强行套本地知识卡片模板

目的：

- 避免外部 RAG 已经生成完整答案后，再被内部模型二次改写
- 降低时延和重复调用成本

### 3.4 RAG API Client 草稿已接入，但仍需确认

当前工作区中新增了：

- `src/modules/knowledge/knowledge-api-client.ts`

并且 `create-assistant-runtime.ts` 已开始接入：

- `RAG_API_KEY`
- `RAG_API_TIMEOUT`
- `RAG_API_RETRY_COUNT`

但要注意：

- 这部分目前仍属于本地工作区改动，不是已稳定落地结论
- 代码里已经出现了超时、重试、`AbortController` 的实现草稿
- 这部分还没有完成充分验证，也还没有形成完整的集成测试闭环

## 4. 当前已验证的内容

已经跑过并通过的定向测试：

```bash
npx vitest run src/modules/assistant/assistant.service.test.ts src/modules/router/request-router.test.ts
```

验证到的结论：

- 远端 `open_response` 快路径和本地改动没有互相打架
- 外部 provider 失败时，路由层会回退本地知识
- 低置信度知识命中不会直接返回给用户

## 5. 仍然存在的风险和未完成项

当前还不能把“RAG 超时问题已经彻底修完”作为结论，原因有以下几条：

### 5.1 真正触发超时的根因还在外部 `/ask` 链路

从日志看，目前超时发生在：

`/api/v1/knowledge/ask -> 外部 RAG 服务 -> https://api.siliconflow.cn/v1/chat/completions`

也就是说：

- 现在做到了“超时后不至于把用户回复打挂”
- 但还没有真正降低外部 `/ask` 自身的超时概率

### 5.2 `KnowledgeApiClient` 的超时/重试能力还需要补验证

当前草稿里已经写了：

- 请求超时
- 失败重试
- 错误分类

但还缺：

- 单元测试
- `create-assistant-runtime` 级别验证
- 真实调用链上的行为确认

### 5.3 webhook 调试响应里存在临时观测字段

当前 `src/app/api/dingtalk/webhook/route.ts` 里加了 `_rag_tracing_` 和较强的调试注释，便于本地观察。

这对当前排查有帮助，但是否长期保留，需要后续明确：

- 如果保留，要整理命名和输出边界
- 如果不保留，需要在收尾时清掉

## 6. 建议的下一步计划

下一阶段建议按下面顺序推进：

1. 先把 `KnowledgeApiClient` 补成可验证状态
   - 给超时、重试、非 2xx 错误、超时不重试等场景补测试
   - 确认 `RAG_API_TIMEOUT / RAG_API_RETRY_COUNT` 的实际行为和文档一致

2. 再收紧外部 RAG provider 策略
   - 重点确认 `/ask` 是否必须作为默认路径
   - 若 `/ask` 继续不稳定，考虑“`ask` 失败时退回 `search`”或按场景拆分调用

3. 补集成级回归
   - `create-assistant-runtime` 相关测试
   - webhook / stream 入口对 `userId`、`sessionId` 的透传测试
   - 外部 RAG 超时后的真实降级路径测试

4. 最后做收尾清理
   - 清理临时调试注释和 `_rag_tracing_`
   - 整理 `.env.example` 和知识库接入文档
   - 再跑一轮更完整的测试集

## 7. 当前对外可同步的话术

可以对外同步为：

> 目前已经完成主分支同步，并把开放聊天链路优化合入本地工作区。外部 RAG 超时场景下的本地知识兜底已经恢复，关键路由测试已通过。下一步会继续补齐 `KnowledgeApiClient` 的超时/重试验证，并决定是否需要把外部 `/ask` 调整为更稳的降级策略。当前阶段建议把这项工作标记为“进行中”，不要标记为“已完全修复”。
