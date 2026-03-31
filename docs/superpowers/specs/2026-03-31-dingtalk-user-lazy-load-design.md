# 钉钉用户懒加载与联系人目录增强设计

> 日期：2026-03-31  
> 状态：Active  
> 适用范围：钉钉 Stream 消息处理链路、用户信息缓存、职能联系人目录  
> 前序背景：[2026-03-26-employee-assistant-routing-design.md](./2026-03-26-employee-assistant-routing-design.md)

---

## 0. 修订记录

| 版本 | 日期       | 说明                                                       |
| ---- | ---------- | ---------------------------------------------------------- |
| v1.0 | 2026-03-31 | 初始设计：懒加载策略、用户信息 DB 模型、联系人 userId 扩展 |

---

## 1. 背景与核心问题

当前系统有两个缺口，阻碍后续 OA 审批代发起等功能落地：

1. **没有用户 userId**：钉钉 Stream 消息虽然携带 `senderStaffId`，但系统从未读取它。发起 OA 审批时需要发起人 userId，目前无从获取。
2. **联系人目录是假数据**：`sample-contact-directory.ts` 中没有真实 userId，无法代发消息或在审批中指定联系人。

---

## 2. 设计原则

- **不拉全量通讯录**：全量通讯录需要高级权限、定期同步，且业务不需要"找任意员工"的能力。
- **懒加载，按需获取**：用户第一次对话时，用 `senderStaffId` 调钉钉 API 拉取详情并缓存；后续对话直接读缓存。
- **职能联系人手动维护**：HR、IT、行政等关键角色（不超过 20 条）手动填写真实 userId，不依赖 API 自动同步。
- **fire-and-forget**：用户信息拉取不阻塞消息回复主链路，失败时降级为仅保存 nick，不影响对话。

---

## 3. 数据模型

### DingTalkUser（Prisma）

```prisma
model DingTalkUser {
  userId    String   @id        // 钉钉企业内 staffId，直接用作主键
  nick      String?             // 消息 payload 里的昵称，兜底字段
  name      String?             // 真实姓名（来自 API）
  mobile    String?
  avatar    String?
  email     String?
  deptIds   String?             // 部门 id 列表，JSON 字符串
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### ContactDirectoryItem（新增 userId 字段）

```ts
type ContactDirectoryItem = {
  id: string;
  title: string;
  keywords: string[];
  contactName: string;
  userId?: string; // 填写后可用于 OA 审批或代发消息
  team?: string;
  description: string;
  actionHint?: string;
};
```

---

## 4. 服务接口

### DingTalkUserService

```ts
createDingTalkUserService(input: {
  clientId: string;
  clientSecret: string;
  store: UserStore;         // 可注入，支持内存/DB 两种实现
  api?: DingTalkApiPort;   // 可注入，支持测试 mock
})
// 返回 { ensureUser(userId, nick?) → DingTalkUserRecord }
```

**store 接口：**

```ts
type UserStore = {
  findUser(userId: string): Promise<DingTalkUserRecord | null>;
  upsertUser(record: DingTalkUserRecord): Promise<void>;
};
```

**降级策略：**

| 情形              | 行为                                                       |
| ----------------- | ---------------------------------------------------------- |
| DB 已有记录       | 直接返回，不调 API                                         |
| DB 没有，API 成功 | 写入完整信息并返回                                         |
| DB 没有，API 失败 | 写入仅含 nick 的基础记录，下次对话不再重试（避免重复失败） |

### DingTalkApiPort（默认实现）

| 方法             | 接口                                        |
| ---------------- | ------------------------------------------- |
| `getAccessToken` | `POST /v1.0/oauth2/accessToken`             |
| `getUserDetail`  | `POST /topapi/v2/user/get?access_token=...` |

---

## 5. Stream 消息链路变更

```
钉钉消息 (payload 含 senderStaffId)
     │
     ├─ onSender(userId, nick) ──→ userService.ensureUser()  ← fire-and-forget
     │
     └─ handler(message) ──→ assistant.reply() ──→ replyMarkdown()
```

`StreamRobotMessage` 新增字段：

```ts
senderStaffId?: string;  // 企业内 userId
senderNick?: string;     // payload 昵称，ensureUser 兜底
```

`createRobotStreamListener` 新增 `onSender` 可选回调，由 `createDingTalkStreamClient` 透传。

---

## 6. 存储策略

### 当前阶段（已实现）

内存 Map 作为 store：

- 进程重启后缓存清空，对话触发后会自动重新拉取
- 成本零，无需额外基础设施
- 适合开发阶段和用户量较小的初期上线

### 下一阶段（待实现）

切换为 Prisma + SQLite：

- 安装 `@prisma/adapter-better-sqlite3`
- 在 start 脚本里把内存 Map 替换为 Prisma store 实现
- 不改动 `DingTalkUserService` 本身，只换注入的 `store`

---

## 7. 职能联系人数据维护

`sample-contact-directory.ts` 需要替换为真实数据，每条记录补充 `userId`：

1. 在钉钉管理后台「人员管理」→「通讯录」里找到对应员工
2. 查看员工详情获取 userId（也叫 staffId）
3. 填入对应 `ContactDirectoryItem.userId`

当前需要维护的角色（参考）：

| 角色              | 关键词                 | 需要 userId |
| ----------------- | ---------------------- | ----------- |
| HR 同学           | 入职、离职、假勤、社保 | ✓           |
| 财务同学          | 报销、发票、财务       | ✓           |
| IT/信息化支持同学 | 权限、系统、账号       | ✓           |
| 行政同学          | 会议室、采购、办公用品 | ✓           |
| 门店系统支持同学  | PMS、制卡、门卡        | ✓           |

---

## 8. 后续演进

- OA 审批代发起：基于已有的 `senderStaffId` 作为发起人，调钉钉审批创建接口
- `TaskCatalogItem` 补充 `processCode` 字段，用于审批流程提交
- session 级别用户上下文：把当前对话用户的 `DingTalkUserRecord` 注入 assistant，让回复更个性化
