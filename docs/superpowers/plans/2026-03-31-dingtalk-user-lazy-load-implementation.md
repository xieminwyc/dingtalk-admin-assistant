# 钉钉用户懒加载与联系人目录增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Stream 消息链路中懒加载发送者的钉钉用户信息，为后续 OA 审批代发起提供发起人 userId；同时给职能联系人目录添加 userId 字段，为代发消息和联系人定向功能打基础。

**Architecture:** 不改变 assistant 主链路，在 `createRobotStreamListener` 收到消息后以 fire-and-forget 方式触发用户信息拉取，失败降级不影响回复。`DingTalkUserService` 通过可注入的 `store` 接口支持内存 Map（当前）和 Prisma DB（后续）两种实现，切换时不需要改动服务本身。

**Tech Stack:** TypeScript、钉钉开放平台 API、Prisma schema、内存 Map store

---

## Scope

本计划实现已批准的 spec：
[2026-03-31-dingtalk-user-lazy-load-design.md](/Users/xiemin/monter/dingtalk-admin-assistant/docs/superpowers/specs/2026-03-31-dingtalk-user-lazy-load-design.md)

本次实现聚焦：

- Prisma schema 新增 `DingTalkUser` 模型
- `DingTalkUserService`：懒加载 + 可注入 store + 钉钉 API 封装
- Stream 消息类型扩展 `senderStaffId` / `senderNick`
- `createRobotStreamListener` 加入 `onSender` 回调
- `createDingTalkStreamClient` 透传 `onSender`，启动脚本接入内存 Map store
- `ContactDirectoryItem` / `ContactDirectoryResolution` 新增 `userId?` 字段

本次不实现：

- Prisma + SQLite adapter 持久化（需先安装 `@prisma/adapter-better-sqlite3`）
- OA 审批代发起
- DingTalkUser 写入 ConversationLog

## File Structure

| 路径                                                | 职责                                                  |
| --------------------------------------------------- | ----------------------------------------------------- |
| `prisma/schema.prisma`                              | 新增 `DingTalkUser` 模型                              |
| `src/modules/dingtalk/dingtalk-user.service.ts`     | 懒加载用户信息服务，store/api 可注入                  |
| `src/modules/dingtalk/stream-client.ts`             | 消息类型补充 senderStaffId，listener 加 onSender 回调 |
| `src/scripts/start-dingtalk-stream.ts`              | 接入用户服务，内存 Map store                          |
| `src/modules/contacts/contact-directory.types.ts`   | ContactDirectoryItem / Resolution 新增 userId?        |
| `src/modules/contacts/contact-directory.service.ts` | mapItemToResolution 透传 userId                       |

---

## 实现状态

### ✅ 任务 1：Prisma schema 新增 DingTalkUser 模型

**文件：** `prisma/schema.prisma`

- [x] 在 schema 中新增 `DingTalkUser` 模型
- [x] 字段：`userId`（@id）、`nick`、`name`、`mobile`、`avatar`、`email`、`deptIds`、`createdAt`、`updatedAt`
- [x] 运行 `npx prisma generate` 更新生成文件

---

### ✅ 任务 2：实现 DingTalkUserService

**文件：** `src/modules/dingtalk/dingtalk-user.service.ts`（新建）

- [x] 定义 `DingTalkUserRecord`、`UserStore`、`DingTalkApiPort` 接口
- [x] 实现默认 `createDingTalkApi()`：`getAccessToken` + `getUserDetail`
- [x] 实现 `createDingTalkUserService()`：
  - DB 有记录 → 直接返回
  - DB 无记录 → 调 API → 写入 DB → 返回
  - API 失败 → 降级写入仅含 nick 的基础记录

---

### ✅ 任务 3：Stream 消息类型与 listener 扩展

**文件：** `src/modules/dingtalk/stream-client.ts`

- [x] `StreamRobotMessage` 新增 `senderStaffId?` / `senderNick?`
- [x] `createRobotStreamListener` 新增 `onSender?: (userId, nick?) => void` 参数
- [x] 收到消息后在调用 handler 前触发 `onSender`（fire-and-forget）
- [x] `createDingTalkStreamClient` 新增 `onSender?` 参数并透传

---

### ✅ 任务 4：启动脚本接入用户服务

**文件：** `src/scripts/start-dingtalk-stream.ts`

- [x] 创建内存 Map store
- [x] 用 `createDingTalkUserService` 初始化用户服务
- [x] `createDingTalkStreamClient` 传入 `onSender` 回调，fire-and-forget 调用 `ensureUser`，失败打 warn 日志

---

### ✅ 任务 5：联系人目录类型扩展

**文件：** `src/modules/contacts/contact-directory.types.ts`、`contact-directory.service.ts`

- [x] `ContactDirectoryItem` 新增 `userId?: string`，附注释说明用途
- [x] `ContactDirectoryResolution` 新增 `userId?: string`
- [x] `mapItemToResolution` 透传 `userId`

---

## 待完成（下一步）

### ⬜ 任务 6：为 DingTalkUserService 编写单元测试

**文件：** `src/modules/dingtalk/dingtalk-user.service.test.ts`（新建）

- [ ] 测试：DB 有记录时直接返回，不调 API
- [ ] 测试：DB 无记录，API 成功时写入完整信息
- [ ] 测试：DB 无记录，API 失败时降级写入 nick 基础记录
- [ ] 测试：`createDingTalkApi` 的 fetch 调用格式

---

### ⬜ 任务 7：切换为 Prisma SQLite 持久化 store

**前置条件：** 安装 `@prisma/adapter-better-sqlite3`

**文件：** `src/scripts/start-dingtalk-stream.ts`

- [ ] 安装依赖：`npm install @prisma/adapter-better-sqlite3 better-sqlite3`
- [ ] 在 start 脚本里用 Prisma store 替换内存 Map
- [ ] 运行 `npx prisma migrate dev` 创建 `DingTalkUser` 表

---

### ⬜ 任务 8：补充 sample-contact-directory 真实数据

**文件：** `src/modules/contacts/sample-contact-directory.ts`

- [ ] 在钉钉管理后台找到各职能角色的真实 userId
- [ ] 为每条 ContactDirectoryItem 填入 `userId`
- [ ] 验证：`ContactDirectoryService.resolve()` 返回的 resolution 中包含 userId
