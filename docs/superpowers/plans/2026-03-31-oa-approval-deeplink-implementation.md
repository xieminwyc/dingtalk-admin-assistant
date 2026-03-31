# OA 审批 Deeplink 直达链接 Implementation Plan

**Goal:** 用户在钉钉机器人对话中说"我要请假/加班/报销"时，机器人回复中包含可直接打开对应审批表单的链接，用户点击即跳转到钉钉 OA 审批发起页。

**Tech Stack:** TypeScript、钉钉 dingtalk:// Deeplink 协议、aflow.dingtalk.com

---

## 背景

经过多轮尝试，最终确定可行的链接方案：

| 方案                                         | 结果                                 |
| -------------------------------------------- | ------------------------------------ |
| AppLink (`applink.dingtalk.com`)             | ❌ 机器人消息 WebView 中报"无效协议" |
| ActionCard 按钮 + AppLink                    | ❌ 同上                              |
| 纯文本操作指引                               | ❌ 用户体验差，无法直接操作          |
| 服务端 API 代提交 (`processinstance/create`) | ❌ 假勤套件不支持 API 发起           |
| aflow.dingtalk.com 网页链接（无 hash 路由）  | ❌ 只打开审批首页，不打开具体表单    |
| **dingtalk:// deeplink + aflow hash 路由**   | ✅ 直接打开指定审批表单              |

最终方案：`dingtalk://dingtalkclient/action/openapp?app_id=-4&redirect_url=https://aflow.dingtalk.com/...#/custom?processCode=PROC-xxx`

---

## 实现状态

### ✅ 任务 1：OA 审批链接生成（oa-link.ts）

**文件：** `src/modules/oa/oa-link.ts`

- [x] `buildAflowFormUrl()`：生成 aflow 内页 URL，使用 hash 路由 `#/custom?processCode=xxx` 指定审批模板
- [x] `buildOaApprovalLink()`：用 `dingtalk://dingtalkclient/action/openapp` 包裹 aflow URL（app_id=-4 = OA审批应用）
- [x] `buildOaHomeLink()`：审批首页兜底链接
- [x] `tryBuildOaApprovalLink()`：corpId 未配置时返回 null，触发降级

---

### ✅ 任务 2：processCode 配置

**文件：** `src/modules/tasks/sample-task-catalog.ts`

- [x] 请假：`PROC-6B84AB06-233D-448B-AFD0-3FAB380F16F3`
- [x] 加班：`PROC-8FEC1302-7EB5-4CBC-A6B5-B38DC7DD95A1`
- [x] 报销：`PROC-A08AFCB5-4D61-4ECF-8EFD-032D9000D8A9`

---

### ✅ 任务 3：processCode 流转打通

**文件：** `src/modules/tasks/task-catalog.service.ts`、`src/modules/router/request-router.ts`

- [x] `mapItemToResolution` 透传 `processCode`
- [x] `buildTaskResolution` 调用 `tryBuildOaApprovalLink` 生成链接，写入 `entry` 字段
- [x] corpId 通过 env → runtime → router 完整透传

---

### ✅ 任务 4：AI 回复保留链接

**文件：** `src/modules/assistant/response-generator.ts`

- [x] system prompt 增加规则：task 模式下必须原样保留 entry 字段的 `dingtalk://` 链接
- [x] 允许用 Markdown 链接格式包裹，但不得修改/缩短/替换原始 URL

---

### ✅ 任务 5：清理废弃文件

- [x] 删除 `src/modules/oa/form-flow.ts`（空文件，API 提交方案遗留）
- [x] 删除 `src/modules/oa/form-definitions.ts`（空文件，API 提交方案遗留）

---

## 环境配置

**`.env.local` 必需变量：**

```
DINGTALK_CORP_ID=dinge94710291e077b2ea39a90f97fcb1e09
```

---

## 已知限制

- 钉钉 OA 会自动恢复上次未提交的草稿（"已自动填写上次未发布的草稿内容"），这是客户端行为，URL 无法控制，用户需手动点"清除内容"
- `dingtalk://` 协议链接在钉钉客户端外（浏览器）无法打开
- 假勤/人事套件的审批模板不支持服务端 API 发起，只能通过链接引导用户手动填写
