# 上下文驱动的员工助手决策与工具协同设计

> 日期：2026-03-28
> 范围：员工助手第二阶段重构
> 目标：把当前“规则优先、固定枚举路由”的员工助手，升级为“上下文驱动、模型主导决策、工具提供事实、模型生成自然回复”的助手架构。

> 2026-03-30 补充：当前代码已经在原方案基础上继续演进。为了避免把“北京七日游攻略”这类开放问题误送进公司知识库，顶层模式已经进一步收敛为：
> `internal_knowledge / task / open_response / clarify`
>
> 对应真实策略是：
> - `internal_knowledge` -> 查公司内部知识源
> - `task` -> 查事务 / OA 工具
> - `open_response` -> 直接模型回答
> - `clarify` -> 信息不足时追问

## 1. 设计目标

当前机器人已经具备基础的钉钉接入、知识卡片检索、事务入口返回和回复编排能力，但整体仍然偏“静态路由器”。

目前存在的核心问题：

1. 意图分类依赖本地规则和固定关键词，容易把自然表达压缩成生硬结果
2. 模型返回值受硬编码枚举强约束，像 `greeting` 这类合理理解会被直接打回 `unknown`
3. `smalltalk` 与 `unknown` 的回复过于模板化，缺少自然助手体验
4. 知识与事务虽然有雏形，但都还没有真正进入“模型判断 -> 工具执行 -> 模型组织回复”的统一链路
5. 当前消息主要按单轮处理，对“聊着聊着转知识、转事务”的连续体验支持不足

本阶段的设计目标是：

1. 让大模型成为主决策器，而不是本地规则成为主裁判
2. 让上下文进入决策过程，支持连续会话中的意图切换
3. 将回复生产拆分为“决策、工具执行、自然生成”三层
4. 统一知识来源边界，支持本地样例知识、上传文档和外部 RAG 的平滑演进
5. 统一事务来源边界，支持本地事务元数据和后续钉钉 OA 能力接入

## 2. 产品定位

目标中的机器人不再只是“行政 FAQ 检索器”，也不是纯开放式聊天机器人，而是一个具有工具能力的员工助手。

它需要同时满足三种用户心智：

1. 用户可能在问制度规则
2. 用户可能想办理某个事务
3. 用户可能只是在闲聊、打招呼、问助手能做什么

更重要的是，这三种心智会在连续对话中互相切换。

例如：

- “你能做什么？”
- “那请假怎么申请？”
- “年假和事假有什么区别？”
- “这个流程我还要准备什么？”

因此，系统不应再把用户每句话都当成孤立消息，而应该将“当前消息 + 最近几轮上下文”作为主输入，再决定是否调用知识工具、事务工具或直接聊天回复。

## 3. 本阶段范围

### 3.1 In Scope

- 顶层主模式压缩为四类：
  - `internal_knowledge`
  - `task`
  - `open_response`
  - `clarify`
- 去掉“规则优先、模型兜底”的主路径，改为“模型优先、必要时轻量降级”
- 将最近几轮上下文纳入决策输入
- 设计并实现统一决策结果结构，而不是只返回单个枚举
- 保留知识工具与事务工具的独立边界
- 将最终回复生成从纯模板拼接升级为“模型基于工具结果自然组织表达”
- 为本地知识、上传文档、外部 RAG 统一成一个知识 provider 层
- 为本地事务目录、后续钉钉 OA 能力统一成一个 task provider 层

### 3.2 Out of Scope

- 直接对接真实钉钉 OA 发起流程
- 自建向量数据库、重排系统和多阶段检索基础设施
- 多轮表单式参数收集
- 完整后台知识管理系统
- 长期记忆和用户画像系统

## 4. 目标交互

### 4.1 顶层主模式

本阶段不再保留 `handoff_request` 和 `unknown` 作为一级意图。

新的主模式定义为：

- `internal_knowledge`
  - 用户主要在询问公司内部规则、制度、政策、说明、口径、适用范围
- `task`
  - 用户主要在表达办理意图、申请动作、流程推进诉求、入口诉求
- `open_response`
  - 用户主要在闲聊、打招呼、询问助手身份、通用知识、天气、攻略、常识问答
- `clarify`
  - 当前上下文不足以稳定判断，需要先补问一句

### 4.2 一期交互示例

| 用户输入 | 结合上下文后的主模式 | 系统处理 |
| --- | --- | --- |
| “你是谁” | `open_response` | 大模型直接自然回复助手身份与能力 |
| “那请假怎么申请” | `task` | 先查事务元数据，再由模型组织办理说明 |
| “年假怎么算” | `internal_knowledge` | 先查知识，再由模型组织结论与适用范围 |
| “北京七日游攻略” | `open_response` | 直接由大模型回答，不查公司知识库 |
| “这个怎么办” | `clarify` | 大模型生成补充问题 |
| “那这个和病假区别呢” | `internal_knowledge` | 结合上文主题继续查知识，而不是回到单句判定 |

## 5. 总体架构

建议的新链路如下：

`DingTalk Channel -> Conversation Context -> Decision Engine -> Tool Layer -> Response Generator -> DingTalk Reply`

核心原则：

1. 模型负责理解意图和对话状态
2. 工具负责提供可靠事实和结构化结果
3. 模型负责把事实组织成自然语言回复
4. 上下文是一级输入，不再只按单条消息做静态路由

### 5.1 Channel Layer

继续沿用现有钉钉接入层：

- `stream-client`
- `stream-handler`
- `webhook route`

这一层仍然只负责：

- 接收消息
- 提取文本
- 调用助手主服务
- 将最终回复发回钉钉

不负责：

- 意图判断
- 工具调用决策
- 业务事实生成

### 5.2 Conversation Context Layer

新增或显式化上下文层，用于收集当前消息前的最近几轮内容。

建议输入至少包含：

- `sessionId`
- 当前用户消息
- 最近 3 到 6 轮用户/助手消息
- 可选的简短对话摘要
- 上下文过期时间或轮次上限

设计要求：

- 决策层读取上下文，而不是只读单句
- 回复生成层也读取上下文，以便承接“那这个呢”“那我要怎么申请”
- 上下文长度需要可控，避免 token 无限增长
- 需要显式定义上下文有效期，避免用户隔很久后一句新话被旧话题误导
- 需要保留会话级唯一标识，防止后续引入记忆或日志后发生串话

首版可以先使用最近几轮原始消息，不强依赖摘要算法。

### 5.3 Decision Engine

Decision Engine 是新的核心模块，由大模型主导。

它的职责不是直接回答用户，而是输出一份结构化决策结果，告诉系统：

- 这一轮主要属于哪种主模式
- 是否需要知识工具
- 是否需要事务工具
- 如果需要澄清，应该怎么追问
- 如果需要检索，可提供更适合检索的语义提示

建议输出结构：

```ts
type AssistantDecision = {
  mode: "internal_knowledge" | "task" | "open_response" | "clarify";
  intentConfidence: number;
  needKnowledge: boolean;
  needTaskResolution: boolean;
  toolPlan: "none" | "knowledge" | "task";
  topicShift: boolean;
  contextBreakConfidence?: number;
  clarifyQuestion?: string;
  knowledgeHint?: string;
  taskHint?: string;
};
```

字段含义：

- `mode`
  - 本轮主模式
- `intentConfidence`
  - 对当前主模式判断的置信度，低分时更容易进入 `clarify`
- `needKnowledge`
  - 是否调用知识工具
- `needTaskResolution`
  - 是否调用事务工具
- `toolPlan`
  - 这轮后续是否调用工具，以及调用哪类工具
- `topicShift`
  - 是否检测到当前用户已经明显跳出上一个话题
- `contextBreakConfidence`
  - 话题切换置信度，用于处理“意图惯性”
- `clarifyQuestion`
  - 如果是 `clarify`，建议模型给出更自然的补问
- `knowledgeHint`
  - 给知识检索的线索，如“年假规则”
- `taskHint`
  - 给事务解析的线索，如“leave_application” 或 “请假申请”

首版推荐策略：

- 由模型直接决策
- 不再由本地关键词规则主导
- 仅在模型接口失败或返回结构完全不可用时，进入轻量澄清降级
- 当 `topicShift=true` 且切换置信度足够高时，强制重置上轮工具链偏向，避免把“闲聊/新问题”误吸回旧主题
- 当 `intentConfidence` 低于阈值时，优先进入 `clarify`

### 5.4 Knowledge Tool Layer

知识层改造成统一的 provider 架构。

对上只暴露统一能力：

```ts
type KnowledgeSearchInput = {
  query: string;
  hint?: string;
  conversationContext?: string[];
};

type KnowledgeSearchResult = {
  hits: Array<{
    id: string;
    title: string;
    content: string;
    scope?: string;
    source: "seed" | "document" | "rag";
    score: number;
    url?: string;
    referenceLabel?: string;
  }>;
  relatedKeywords?: string[];
};
```

底层来源可以逐步演进为：

1. `seed provider`
   - 当前项目里的样例知识卡片
2. `document provider`
   - 用户上传的文档解析结果
3. `rag provider`
   - 外部 RAG API

设计要求：

- 对决策层和回复层隐藏底层来源差异
- 返回统一结构
- 支持先本地、后文档、再外部 RAG 的渐进式升级
- 在可能的情况下保留可展示给用户的引用标签，例如制度名、文档标题或来源链接
- 在检索无果时返回 `relatedKeywords`，便于回复层给出“你是不是想问 A / B”的引导

知识层还需要支持一个受约束的“轻推导”原则：

- 工具层负责提供事实
- 回复层允许基于这些事实做简单算术和有限逻辑整理
- 不允许脱离事实来源进行开放式推测

例如：

- 已检索到“剩余年假 5 天”
- 用户问“请 3 天后还剩多少”
- 回复层可以基于已知事实做简单减法表达，而不是机械复述规则

### 5.5 Task Tool Layer

事务层也统一成 provider 边界。

首版仍可由本地任务目录提供：

- 事务名称
- 说明
- 入口 URL
- 准备项
- 兜底联系人

但设计上不要把事务回复写死在模板中，而是把事务工具看成一个“提供结构化事务事实”的能力层。

建议接口：

```ts
type TaskResolveInput = {
  query: string;
  hint?: string;
  conversationContext?: string[];
};

type TaskResolveResult = {
  taskType?: string;
  title: string;
  description: string;
  entryUrl?: string;
  actionType?: "url" | "api";
  availability?: "available" | "unavailable" | "unknown";
  availabilityReason?: string;
  preparations: string[];
  fallbackContact?: string;
  nextAction?: string;
};
```

后续可平滑扩展：

- 从“返回入口链接”升级到“发起钉钉 OA 流程”
- 从“静态目录”升级到“实时事务服务”

补充要求：

- `availability` 用于表达“当前是否可办理”
- 当事务受时间窗、权限、状态机或业务周期影响时，应优先由 provider 提供明确状态
- 当 `availability=unavailable` 时，回复层应优先解释原因和下一步，而不是继续给无效入口

### 5.6 Response Generator

Response Generator 负责最终面向用户的自然语言输出。

它的输入应包含：

- 当前用户消息
- 最近几轮上下文
- Decision Engine 输出
- Knowledge / Task 工具结果

它的输出是：

- 一段最终可直接发给钉钉的文本

不同主模式的建议行为：

- `open_response`
  - 直接由大模型自然回复
- `clarify`
  - 由大模型生成针对性的补充问题
- `internal_knowledge`
  - 先查知识，再由大模型基于检索结果生成自然说明
- `task`
  - 先查事务元数据，再由大模型基于事务结果生成自然办理指导

硬边界要求：

- 制度事实、链接、准备项必须来自工具结果，不允许模型虚构
- 模型负责解释和组织语言，不负责编造事实
- 若工具结果提供引用来源，回复中应优先显式标注来源，提升可信度
- 回复生成前应经过最小隐私与敏感信息检查，避免把不应暴露的上下文原样带出

## 6. 数据流

### 6.1 主流程

建议的新主流程如下：

1. 接收用户消息
2. 读取最近几轮上下文
3. 调用 Decision Engine 生成结构化决策
4. 根据决策结果决定是否调用知识或事务工具
5. 将工具结果回填给 Response Generator
6. 生成自然回复并返回钉钉

可视化为：

```text
用户消息
+ 最近几轮上下文
+ 助手能力说明
  -> Decision Engine
  -> 得到 mode / toolPlan / needKnowledge / needTaskResolution / hints
  -> Tool Layer
     - knowledge provider
     - task provider
  -> Response Generator
  -> 最终回复
```

### 6.2 连续对话中的意图切换

连续对话是本阶段的重点能力。

示例：

- 用户：“你能做什么？”
- 助手：自然介绍能力
- 用户：“那请假怎么申请？”
- 系统：切到 `task`
- 用户：“那年假和事假有什么区别？”
- 系统：切到 `internal_knowledge`

因此：

- 主模式必须允许逐轮切换
- 上下文必须作为决策输入
- 不要求用户重新构造完整句子
- 需要显式防范“意图惯性”，避免上轮主题强行污染本轮判断

## 7. 降级与错误处理

### 7.1 Decision Engine 失败

当模型接口失败或返回结构不可解析时：

- 不回到当前的“规则优先”旧链路
- 首版统一进入轻量澄清回复

例如：

- “我先确认一下，你是想查制度说明，还是想办理流程？”

### 7.2 Knowledge Tool 无命中

当知识工具没有返回可靠结果时：

- 不直接输出固定的“当前未找到可靠知识”
- 应由 Response Generator 更自然地说明：
  - 暂时没检索到明确答案
  - 可建议补充关键词
  - 必要时建议联系对应部门
- 若 provider 返回 `relatedKeywords`，应优先将其转化为引导式追问

示例：

- “我暂时没找到关于‘年假补偿’的明确规定。你是想了解‘年假折现’，还是‘离职补偿’？”

### 7.3 Task Tool 无命中

当事务工具无法定位明确事务时：

- 返回“未定位到准确事务配置”的工具结果
- 由 Response Generator 自然表达：
  - 当前还没匹配到准确入口
  - 可以补充要办理的事项
  - 必要时建议联系对应部门
- 若 provider 返回相近事务关键词，也应转化为引导式追问，而不是只说“没找到”

### 7.4 隐私与安全边界

虽然本阶段不建设完整记忆系统，但仍需明确以下边界：

- 上下文只读取当前会话的消息，不跨会话引用
- 若后续引入日志、记忆或用户画像，默认不进入回复生成 prompt，除非显式授权
- 回复层需要最小化敏感信息透传
- 任何内部代号、他人咨询内容、未公开信息都不能因上下文污染被带出

## 8. Prompt 设计原则

本阶段至少有两类 prompt：

### 8.1 Decision Prompt

目标：

- 让模型输出结构化决策 JSON
- 明确只允许四种 `mode`
- 明确 `open_response` 包含闲聊、打招呼、能力询问、天气、攻略、通用知识
- 明确 `clarify` 只在信息不足时使用
- 明确当对话中出现承接关系时，必须结合上下文判断
- 明确要求模型识别话题是否已经明显切换
- 明确要求模型在低置信时不要硬判，应转入 `clarify`
- 明确只有 `internal_knowledge` 和 `task` 才允许调工具

### 8.2 Response Prompt

目标：

- 基于上下文和工具结果生成自然回复
- 对 `internal_knowledge` 回复强调“依据检索结果回答”
- 对 `task` 回复强调“说明办理方式并引用真实入口”
- 对 `open_response` 回复强调自然、简洁，并根据问题类型自动切换闲聊口吻或知识型结构
- 对 `clarify` 回复强调只问当前最关键的补充问题
- 若存在知识来源、制度标题、文档标题或链接，应优先带上引用溯源
- 允许做受约束的轻推导，但必须显式基于工具事实

## 9. 对现有代码的重构方向

### 9.1 `intent-analyzer`

从“规则分类器”升级为“决策器适配层”。

不再主要负责：

- 正则规则命中
- 单个固定枚举返回

转而负责：

- 组织上下文输入
- 调用决策模型
- 返回结构化决策对象

### 9.2 `request-router`

从“按固定意图 switch 分支”升级为“按决策结果协调工具执行”。

主要职责变成：

- 读取 `AssistantDecision`
- 调用知识或事务工具
- 产出统一的执行结果对象

### 9.3 `reply-builder`

从“本地模板拼装器”升级为“Response Generator 适配边界”。

首版仍可保留纯文本输出契约，但内部来源从静态模板改为：

- 模型自然生成
- 工具结果注入

### 9.4 `knowledge`

将当前本地知识卡和外部 RAG retriever 统一纳入 provider 层。

后续新增上传文档时，只新增 provider，不重写上层路由。

### 9.5 `tasks`

保留现有事务目录作为首版 provider。

后续钉钉 OA 接入时，扩展 provider 能力，而不是重新发明整条链路。

## 10. 测试策略

本阶段测试分为四层：

1. Decision Engine 测试
   - 多轮上下文场景
   - `chat -> task -> knowledge` 切换场景
   - `clarify` 场景
2. Knowledge Provider 测试
   - 本地样例知识命中
   - 上传文档命中
   - 外部 RAG provider 返回归一化
3. Task Provider 测试
   - 事务入口命中
   - 事务无命中
   - hint 辅助解析
4. Response Generator 测试
   - 工具结果注入后可生成自然回复
   - 不允许凭空编造入口和制度信息
   - 无命中时能给出指引性兜底而不是机械失败提示
5. 安全边界测试
   - 不跨会话引用上下文
   - 敏感信息不被原样泄露
6. 置信度与话题切换测试
   - `intentConfidence` 低分进入 `clarify`
   - 明显话题切换时触发 `topicShift`

## 11. 迁移策略

推荐按以下顺序落地：

1. 先引入上下文决策结果结构
2. 用模型决策替换当前规则优先逻辑
3. 将知识工具统一为 provider 层
4. 将事务工具统一为 provider 层
5. 将 `reply-builder` 升级为模型驱动的自然回复生成
6. 最后再接入上传文档与外部 RAG
7. 在能力稳定后，再评估 Decision 与 Tool 的并行预取优化

这样可以避免一次性重写过多模块，同时能尽快验证“连续上下文 + 模型主导决策”的核心体验。

## 12. 设计结论

本阶段建议明确转向：

- 从“规则优先的意图分类器”升级为“上下文驱动的决策器”
- 从“固定模板回复”升级为“工具提供事实 + 模型自然生成”
- 从“单一知识卡片”升级为“统一 knowledge provider”
- 从“静态事务目录回复”升级为“统一 task provider”

这套设计既能满足当前“先把体验做好”的目标，也为后续三件事留出了稳定接口：

1. 上传文档作为知识来源
2. 外部 RAG 检索接入
3. 钉钉 OA 等真实事务执行能力接入

为进一步提升可靠性，本设计额外吸收以下原则：

1. 引入 `intentConfidence` 和 `topicShift`，处理连续对话中的意图惯性
2. 引入知识引用溯源和 `relatedKeywords`，提升可解释性与引导能力
3. 引入事务 `availability`，避免给出不可办理的无效入口
4. 引入隐私与安全边界，避免上下文污染导致的信息泄露
