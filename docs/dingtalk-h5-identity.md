# 钉钉 H5 工作台 — 用户身份识别接入文档

> 记录日期：2026-04-04

## 最终方案

使用 **OAuth2 授权码模式**（`login.dingtalk.com/oauth2/auth`）获取用户身份，放弃 JSAPI 免登方案。

### 整体流程

```
用户打开 H5 页面
    │
    ├─ URL 里有 senderStaffId？ ──→ 直接使用（Stream webhook 注入的场景）
    │
    ├─ URL 里有 authCode/code？ ──→ 发到后端换 userId
    │   │
    │   └─ 后端流程：
    │       code → oauth2/userAccessToken（换 user access token）
    │           → contact/users/me（拿 unionId）
    │           → gettoken（拿 app access_token）
    │           → topapi/user/getbyunionid（unionId → corp userId）
    │
    └─ 都没有？ ──→ 302 跳转到钉钉 OAuth2 授权页
                    用户授权后带 code 回来，走上面的流程
```

### 关键代码文件

| 文件 | 职责 |
|------|------|
| `src/modules/dingtalk/browser-identity.ts` | 前端：识别流程调度（query → OAuth2 code → 发起跳转） |
| `src/modules/dingtalk/dingtalk-identity.service.ts` | 后端：API 调用链（4 步换码） |
| `src/app/api/dingtalk/browser-identity/route.ts` | 后端：API route，接收前端 authCode 并返回 userId |
| `src/app/_components/home-shell.tsx` | 前端：调用 `resolveDingTalkSenderIdentity` 并存储结果 |

### OAuth2 跳转参数

```
https://login.dingtalk.com/oauth2/auth
  ?redirect_uri={当前页面 origin + pathname}
  &response_type=code
  &client_id={DINGTALK_CLIENT_ID}
  &scope=openid corpid
  &prompt=auto
```

- `prompt=auto`：钉钉内打开时可能自动授权跳过登录页（但实测钉钉 H5 仍会显示"立即登录"页面，这是钉钉的固定行为，无法绕过）
- `scope=openid corpid`：必须包含 `corpid`，否则后续 `getbyunionid` 会失败

### 防无限跳转

使用 `sessionStorage` 的 `dt-oauth2-redirect-attempted` key 作为守卫：
- 跳转前设为 `"1"`
- 换码成功后清除
- 如果已经设过了就不再跳转，返回 `source: "unavailable"`

---

## 踩坑记录

### 坑 1：JSAPI `requestAuthCode` 拿到的 code 无法换取用户信息

**现象**：`dd.runtime.permission.requestAuthCode` 成功返回了 32 位的 code，但用这个 code 调 `topapi/v2/user/getuserinfo` 始终返回 `errcode: 40078`（临时授权码不存在）。

**原因**：JSAPI 免登返回的 code 和 OAuth2 返回的 code 是不同体系。对于当前应用类型（H5 微应用），JSAPI 的 code 无法被后端接口识别。

**结论**：放弃 JSAPI 免登，只用 OAuth2 redirect。

**浪费的时间**：尝试了 10+ 次不同的 JSAPI 调用方式（`dd.requestAuthCode`、`dd.runtime.permission.requestAuthCode`、传 `corpId`、传 `clientId`），全部返回 40078。

### 坑 2：两套 API 体系混用

钉钉有两套 API：

| | 旧版 (oapi.dingtalk.com) | 新版 (api.dingtalk.com) |
|---|---|---|
| 获取 token | `gettoken?appkey=&appsecret=` | `oauth2/userAccessToken` |
| 获取用户信息 | `topapi/v2/user/getuserinfo` | `contact/users/me` |
| 用户 ID 类型 | userId（corp 内） | unionId（跨组织） |

**关键**：最终拿到的 `unionId` 还需要通过**旧版** `topapi/user/getbyunionid`（需要旧版 access_token）转换为 corp 内的 `userId`。所以两套 API 都要用。

### 坑 3：`redirect_uri` 必须精确匹配

钉钉开发者后台「安全设置 → 重定向URL」里配的地址必须和代码里的 `redirect_uri` 完全一致。

- 末尾有没有 `/` 都算不同
- 本地开发要加 `http://localhost:3001`（多个地址用逗号分隔）
- 改完安全设置后**必须重新发布应用**才生效

### 坑 4：`$CORPID$` 占位符

钉钉文档说在应用首页 URL 里写 `?corpid=$CORPID$`，钉钉打开时会自动替换为真实 corpId。但这只在钉钉客户端内有效，普通浏览器不会替换。最终我们不需要 corpId（因为不用 JSAPI），所以这个占位符也没用了。

### 坑 5：钉钉 H5 内"立即登录"页面无法跳过

即使设置 `prompt=auto` 或不设 `prompt`，钉钉 H5 工作台内打开 OAuth2 授权页面时仍会显示一个"立即登录"按钮页面。这是钉钉 OAuth2 的固定行为，不是我们能控制的。用户需要点一下"立即登录"才能完成授权。

---

## 环境变量

| 变量名 | 用途 | 必填 |
|--------|------|------|
| `DINGTALK_CLIENT_ID` | 钉钉应用的 AppKey / ClientID，前后端都用 | 是 |
| `DINGTALK_CLIENT_SECRET` | 钉钉应用的 AppSecret，仅后端使用 | 是 |
| `DINGTALK_CORP_ID` | 企业 corpId，用于生成审批表单直达链接（OA 模块用） | 否 |

> `DINGTALK_CLIENT_ID` 同时也是 AppKey，钉钉新版控制台里叫 ClientID，旧版叫 AppKey，是同一个值。

---

## 钉钉开发者后台配置清单

从零配一个新应用需要做以下所有步骤：

### 1. 创建应用

- 登录 [钉钉开放平台](https://open-dev.dingtalk.com/)
- 进入「应用开发 → 企业内部开发 → 创建应用」
- 选择「H5 微应用」类型

### 2. 获取凭证

- 「凭证与基础信息」页面，记下 **ClientID**（AppKey）和 **ClientSecret**（AppSecret）
- 设为环境变量 `DINGTALK_CLIENT_ID` 和 `DINGTALK_CLIENT_SECRET`

### 3. 配置安全设置

- 「安全设置 → 重定向URL（回调域名）」：添加所有部署地址，多个用**英文逗号**分隔
  - 例：`https://dingtalk-admin-assistant.vercel.app,http://localhost:3001`
  - 注意末尾不要加 `/`
- 「安全设置 → 服务器出口IP」：如果用了 Stream 模式（机器人 webhook），不需要配 IP 白名单

### 4. 开通权限

进入「权限管理」，搜索并开通以下权限：

| 权限名称 | 权限 code | 用途 |
|---------|-----------|------|
| 个人手机号信息 | `Contact.User.mobile` | OAuth2 `contact/users/me` 获取 unionId |
| 通讯录个人信息读权限 | `Contact.User.Read` | `topapi/v2/user/get` 获取用户详情（姓名、头像等） |
| 根据 unionid 获取用户 userid | `Contact.User.unionid_to_userid` | `topapi/user/getbyunionid` 将 unionId 转为 corp userId |
| 企业内机器人发送消息 | -- | 如果用了机器人 Stream 功能 |

> 如果权限搜不到，试试「接口权限」tab 直接搜 API 路径，如 `topapi/user/getbyunionid`。

### 5. 配置应用首页

- 「应用功能 → 网页应用」（或「H5 微应用」）
- 应用首页 URL 填部署地址，例：`https://dingtalk-admin-assistant.vercel.app`
- PC 端首页可填同一地址

### 6. 配置机器人（如果需要）

- 「应用功能 → 消息推送」或「机器人」
- 选择 **Stream 模式**（推荐，不需要公网回调地址）
- 代码中使用 `dingtalk-stream` SDK 连接

### 7. 发布应用

- **每次修改权限、安全设置后都必须重新发布**，否则不生效
- 「版本管理与发布 → 创建新版本 → 发布」
- 可以先发到灰度范围测试

### 8. 设置可见范围

- 「版本管理与发布」中设置应用可见范围
- 选择需要使用的部门或人员

---

## 用到的钉钉 API 汇总

| API | 版本 | 用途 | 备注 |
|-----|------|------|------|
| `login.dingtalk.com/oauth2/auth` | 新版 | OAuth2 授权页面（前端跳转） | scope 必须含 `corpid` |
| `api.dingtalk.com/v1.0/oauth2/userAccessToken` | 新版 | 用 code 换 user access token | 用户级别 token |
| `api.dingtalk.com/v1.0/contact/users/me` | 新版 | 获取当前用户 unionId | 需要 user access token |
| `oapi.dingtalk.com/gettoken` | 旧版 | 获取应用级 access_token | 用 appkey + appsecret |
| `oapi.dingtalk.com/topapi/user/getbyunionid` | 旧版 | unionId → corp userId | 需要应用级 access_token |
| `oapi.dingtalk.com/topapi/v2/user/get` | 旧版 | 获取用户详情（姓名、手机等） | 懒加载用户信息时用 |
| `api.dingtalk.com/v1.0/oauth2/accessToken` | 新版 | 获取应用级 access_token | Stream 模块和用户信息模块用 |
