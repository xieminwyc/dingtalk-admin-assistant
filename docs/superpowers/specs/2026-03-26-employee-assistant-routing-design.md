# 员工助手意图路由与知识接入设计

> 日期：2026-03-26
> 范围：第一子项目
> 目标：把当前钉钉机器人升级为“事务路由型员工助手”，先跑通知识问答、事务入口跳转、轻量知识接入和后续外部 RAG 挂载边界。

## 1. 设计目标

当前机器人已经能接收钉钉消息并返回 FAQ 文本，但还停留在“命中一条问答就回复”的阶段。第一子项目的目标不是一次性建设完整智能办公平台，而是先把员工最真实的使用路径搭起来：

`员工一句话提需求 -> 系统判断是查知识还是办事情 -> 返回正确说明和入口`

本设计聚焦四件事：

1. 建立意图分析与路由层
2. 建立知识卡片与事务目录两类内容结构
3. 建立支持后续扩展的轻量数据库模型
4. 预留外部 RAG Provider 接口，但不在本项目内建设重型 RAG 基础设施

## 2. 产品定位

这不是一个只会“查 FAQ”的机器人，而是一个站在员工角度的内部助手。

员工并不天然区分“我是在问制度”还是“我是在办业务”。他们更可能直接说：

- “我要请假”
- “报销怎么弄”
- “帮我开会议室”
- “补卡流程是什么”
- “找谁开权限”

因此系统需要把员工表达先解释为意图，再决定走哪条处理路径，而不是默认所有输入都按 FAQ 处理。

## 3. 本子项目范围

### 3.1 In Scope

- 将用户输入粗分为五类意图：
  - `knowledge_query`
  - `task_request`
  - `handoff_request`
  - `smalltalk`
  - `unknown`
- 建立路由层，按意图将请求分流到知识、事务、转人工或保守回复
- 建立多部门知识承载方式，但第一期只要求内容结构可扩展，不要求一次性填满所有部门
- 建立事务目录，用于“我要请假/报销/开权限”这类入口型请求
- 支持“钉钉文档 -> 人工整理 -> Markdown/文本卡片 -> 系统导入”的临时知识流程
- 预留接入外部 RAG API 的 Provider 边界
- 为后续一键发起 OA 审批保留扩展位

### 3.2 Out of Scope

- 自建向量库、切片流水线、Embedding 生成与重排体系
- 钉钉文档自动同步
- 直接发起 OA 审批
- 完整后台 CMS
- 多轮事务参数收集

## 4. 核心交互

### 4.1 员工视角的一期体验

第一期系统优先做到：

1. 员工说“我要做什么”，机器人能识别需求类型
2. 如果是知识问题，机器人给出清晰、保守、可执行的答案
3. 如果是事务办理，机器人直接给入口和注意事项，而不是只讲制度
4. 如果系统拿不准，优先引导或转人工，而不是编造答案

### 4.2 一期推荐交互结果

| 用户输入 | 目标意图 | 系统输出 |
| --- | --- | --- |
| “年假怎么算” | `knowledge_query` | 返回规则说明、适用范围、补充说明 |
| “我要请假” | `task_request` | 返回请假办理说明、准备项、OA 入口 |
| “帮我找行政” | `handoff_request` | 返回人工联系方式或负责人 |
| “你好” | `smalltalk` | 返回简短欢迎和能力范围 |
| “这个怎么弄” | `unknown` | 返回澄清提示或推荐高频入口 |

## 5. 总体架构

建议的系统链路如下：

`DingTalk Stream -> Message Handler -> Intent Analyzer -> Request Router -> Knowledge Resolver / Task Resolver / Handoff -> Reply Builder -> DingTalk Reply`

模块边界如下。

### 5.1 Channel Layer

负责接收钉钉消息与发送回复，继续沿用现有 `stream-client` 和 `stream-handler` 作为接入层。

职责：

- 接钉钉 Stream 消息
- 提取用户文本
- 调用员工助手主服务
- 发送文本或后续卡片回复

不负责：

- 意图判断
- 检索
- 业务路由

### 5.2 Intent Layer

负责把用户自然语言转成结构化意图结果。

首版输出建议包含：

```ts
type IntentResult = {
  intent:
    | "knowledge_query"
    | "task_request"
    | "handoff_request"
    | "smalltalk"
    | "unknown";
  domainCode?: string;
  taskType?: string;
  confidence: number;
  reason?: string;
};
```

策略采用：

- 规则优先
- 模型兜底

规则处理明确场景，如：

- “请假/报销/预约/申请/开通” -> `task_request`
- “流程/规则/怎么规定/怎么办” -> `knowledge_query`
- “人工/负责人/找谁” -> `handoff_request`
- “你好/在吗/你是谁” -> `smalltalk`

规则不确定时，再调用外部模型做分类。

部门域的唯一来源定义为数据库中的 `departments.code`。

- 代码层不维护硬编码部门枚举
- `IntentResult.domainCode` 只承接路由结果
- 首版由系统种子数据写入常见部门，例如 `admin / hr / it / finance / legal / procurement`
- 后续新增部门时，以数据库配置为准，不要求改动意图结果类型定义

### 5.3 Router Layer

这是系统调度中心。

根据 `IntentResult` 决定后续路径：

- `knowledge_query` -> `Knowledge Resolver`
- `task_request` -> `Task Resolver`
- `handoff_request` -> `Handoff Resolver`
- `smalltalk` -> `Smalltalk Reply`
- `unknown` -> `Clarification Reply`

为避免实现阶段出现歧义，路由层需要额外定义首版 tie-break 规则：

1. 如果输入同时包含“办理动作词”和“规则说明词”，优先判定是否存在明确事务实体
2. 若命中明确事务实体，如“请假”“报销”“补卡”“权限申请”，优先走 `task_request`
3. 若输入主要在询问制度、口径、适用范围，如“年假怎么算”“报销规则是什么”，优先走 `knowledge_query`
4. 如果规则判断与模型判断冲突，首版采用“高置信规则优先，低置信规则交给模型”的策略
5. 当规则和模型都无法形成稳定结论时，统一降级到 `unknown`

示例：

- “我要请假” -> `task_request`
- “请假流程是什么” -> `task_request`
  因为用户目标仍然是进入办理路径，知识说明应作为事务回复的一部分返回
- “年假规则是什么” -> `knowledge_query`
- “报销怎么弄” -> `task_request`

### 5.4 Knowledge Layer

知识层不负责“理解用户要办什么事”，只负责在确定是知识问答后提供内容。

第一期先支持：

- 本地知识卡片

后续扩展：

- 外部 RAG API Provider

接口建议保持统一：

```ts
export type KnowledgeHit = {
  id: string;
  title: string;
  answer: string;
  scope?: string;
  source: "card" | "external_rag";
  score: number;
};

export interface KnowledgeRetriever {
  search(query: string, options?: { domain?: string }): Promise<KnowledgeHit[]>;
}
```

### 5.5 Task Layer

事务层负责“把员工带到正确入口”，不承担重型知识召回。

每个事务项需要至少回答：

- 这是什么事务
- 适用于什么情况
- 需要准备什么
- 去哪里办理
- 有没有后续自动化空间
- 找谁兜底

### 5.6 Reply Layer

统一把知识命中、事务命中、转人工结果拼成钉钉可读回复。

第一期先输出结构化文本。
后续可以升级成：

- Markdown 卡片
- 按钮卡片
- 快捷入口

## 6. 意图分析策略

### 6.1 粗粒度分类优先

第一期只做五类粗分，不在首版里直接做到几十个细粒度业务标签。

原因：

- 容易建立稳定规则
- 更适合先跑通主流程
- 不会把意图识别和业务字典绑死
- 后续细分部门和事务类型时可以逐步下钻

### 6.2 模型使用策略

模型可以参与意图分析，但不建议“所有输入都调用模型”。

推荐方案：

- 本地规则先判断明显场景
- 模糊场景再调用模型
- 模型只输出结构化路由结果，不直接生成最终业务答案

### 6.3 模型 Provider 约束

当前设计允许使用 SiliconFlow 的 OpenAI Compatible 接口做分类或轻量整理，但必须遵守：

- API Key 只存环境变量，不写入仓库
- 模型调用仅用于意图分析、澄清建议和轻量答案整理
- 高风险知识问答仍以检索结果和规则输出为主

建议环境变量：

```env
SILICONFLOW_API_KEY=
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
SILICONFLOW_MODEL=Qwen/Qwen2.5-7B-Instruct
```

## 7. 知识输入方式

### 7.1 原始知识源

长期知识源是企业内文档体系，当前已确认以钉钉文档为主。

### 7.2 一期导入策略

第一期不做钉钉文档自动同步，而是采用人工整理导入。

知识流转方式为：

`钉钉文档 -> 人工整理 -> Markdown/文本卡片 -> 系统导入`

### 7.3 卡片设计

知识卡片与事务卡片都采用“轻 metadata + 自由正文”的半结构化形式。

示例：

```md
---
department: hr
type: task
title: 请假申请
keywords: 请假,年假,病假,事假,休假
hasEntry: true
entryUrl: https://example.com/oa/leave
owner: hr-team
---

适用场景：
员工需要发起请假审批。

办理说明：
1. 进入请假审批入口
2. 选择假别
3. 填写时间与原因
4. 提交审批

注意事项：
病假需补充证明。
```

### 7.4 为什么不用纯 FAQ

因为员工的问题并不只有“制度是什么”，还包括“我现在要办什么”。单一 FAQ 结构无法同时承接：

- 规则说明
- 办理入口
- 注意事项
- 后续自动执行扩展位

## 8. 数据模型

由于重型 RAG 由其他团队建设，本项目只保留支撑路由、事务入口、日志与配置所需的轻量模型。

### 8.1 `departments`

部门域主表。

用途：

- 统一域枚举
- 为知识卡片和事务目录归类
- 方便后续扩展更多部门

约束：

- `departments.code` 是系统内部门域唯一标准
- 意图识别、路由、知识卡片、事务目录都引用同一套 `code`
- 首版使用种子数据初始化常见部门，不在 TypeScript 中重复维护第二套静态枚举

关系：

- `departments 1:N knowledge_cards`
- `departments 1:N task_catalog_items`

### 8.2 `knowledge_cards`

存本地整理后的知识型卡片。

用途：

- 高稳定知识承载
- 第一阶段临时知识底座
- 外部 RAG 尚未接入前的主要知识来源

关键字段建议：

- `id`
- `department_id`
- `title`
- `slug`
- `keywords`
- `summary`
- `content_markdown`
- `owner`
- `status`
- `source_type` (`dingtalk_doc_manual`)
- `source_ref`
- `updated_at`

### 8.3 `task_catalog_items`

存事务型入口。

用途：

- 请假、补卡、报销、开权限、预约会议室等事务处理入口
- 后续升级为自动发起审批的基础

关键字段建议：

- `id`
- `department_id`
- `task_type`
- `title`
- `keywords`
- `description`
- `preparation_notes`
- `entry_url`
- `entry_type` (`oa`, `deeplink`, `web`, `manual`)
- `owner`
- `fallback_contact`
- `supports_auto_execute`
- `updated_at`

### 8.4 `knowledge_provider_configs`

存知识 Provider 配置。

用途：

- 切换本地知识卡片与外部 RAG Provider
- 支持未来多知识源并存

关键字段建议：

- `id`
- `provider_name`
- `provider_type` (`local_cards`, `external_rag`)
- `base_url`
- `model`
- `is_enabled`
- `routing_domains`
- `timeout_ms`
- `metadata_json`

说明：

- API Key 不入库，仍使用环境变量
- 数据库只存 Provider 元信息与路由配置

### 8.5 `conversation_logs`

存会话轨迹。

用途：

- 排查路由错误
- 统计高频请求
- 为后续意图优化积累样本

关键字段建议：

- `id`
- `user_id`
- `user_message`
- `intent`
- `domain`
- `task_type`
- `route_type`
- `knowledge_card_id`
- `task_catalog_item_id`
- `provider_name`
- `confidence`
- `reply_excerpt`
- `created_at`

### 8.6 可选表：`intent_examples`

这张表不是首版必须，但建议预留。

用途：

- 积累真实用户表达
- 优化规则与模型分类
- 为后续评估集打基础

## 9. 表关系

数据库关系建议保持轻量、清晰：

- `departments -> knowledge_cards`
- `departments -> task_catalog_items`
- `conversation_logs -> knowledge_cards` 可空
- `conversation_logs -> task_catalog_items` 可空

`knowledge_provider_configs` 独立存在，不强行和知识卡片做一对一绑定，因为后续一个 Provider 可能覆盖多个部门和多个路由域。

## 10. 请求处理流程

### 10.1 知识型请求

1. 接收用户消息
2. 意图识别为 `knowledge_query`
3. 路由到本地知识卡片检索
4. 若无命中且外部 RAG Provider 已启用，则调用外部 RAG
5. 组装结构化回复
6. 若仍无可靠结果，则转人工或给保守提示

### 10.2 事务型请求

1. 接收用户消息
2. 意图识别为 `task_request`
3. 提取部门域和 `task_type`
4. 查询事务目录
5. 返回办理说明、入口链接与注意事项
6. 若无匹配入口，则转人工或返回负责人

## 11. 错误处理

设计目标是“宁可保守，不要瞎答”。

### 11.1 意图不确定

- 返回澄清问题，或推荐高频事务入口
- 不直接走自由生成答案

### 11.2 知识未命中

- 优先返回保守提示
- 若配置了负责人或人工入口，则附带转人工方式

### 11.3 外部 Provider 不可用

- 记录日志
- 降级到本地知识卡片
- 如果本地也无结果，返回保守答复

### 11.4 事务入口失效

- 返回兜底联系人
- 标记日志，方便后续修复目录

## 12. 测试策略

第一子项目需要把测试重点从“简单 FAQ 命中”扩展到“路由正确性”。

建议测试分层：

1. `Intent Analyzer` 单元测试
   - 明确规则词命中
   - 模糊输入回落到模型兜底
   - 意图分类输出格式正确

2. `Router` 单元测试
   - `knowledge_query` 走知识路径
   - `task_request` 走事务路径
   - `handoff_request` 走人工路径

3. `Knowledge Resolver` 测试
   - 本地卡片检索成功
   - 外部 Provider 降级逻辑

4. `Task Resolver` 测试
   - 事务入口匹配
   - 入口缺失时兜底回复

5. `End-to-End Service` 测试
   - “我要请假”返回事务入口
   - “补卡流程是什么”返回知识答案
   - “帮我找行政”返回人工提示

## 13. 实施顺序建议

本设计对应的实现顺序建议如下：

1. 抽象 `Intent Analyzer` 与 `Router`
2. 扩展 `Assistant Service`，从单一路径改为多路由
3. 引入 `Knowledge Card` 与 `Task Catalog` 数据结构
4. 在本地先用种子数据跑通
5. 加入 `SiliconFlow` 配置层与模型兜底分类
6. 增加 `conversation_logs`
7. 预留外部 RAG Provider 接口

## 14. 未来扩展

这份设计刻意为后续能力留出了边界：

- 外部 RAG API 接入
- 钉钉文档自动同步
- 事务多轮参数收集
- 一键发起 OA 审批
- 更细粒度部门与任务类型
- 管理端内容维护后台

这些能力都应建立在当前的意图路由与双资产模型之上，而不是绕开它们直接堆功能。

## 15. 结论

第一子项目不做“全能机器人”，而是先做“正确路由的员工助手”。

系统重点不是回答得多花哨，而是：

- 员工说得自然
- 系统判断得正确
- 事务能给对入口
- 知识能给稳答案
- 外部 RAG 到位后可以平滑接入

这会把当前机器人从“问答 Demo”推进到“可扩展员工助手骨架”，并为后续多部门知识、OA 跳转与更复杂执行能力打好边界。
