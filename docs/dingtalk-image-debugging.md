# 钉钉图片识别链路排障记录

## 背景

本项目在钉钉 Stream 机器人场景下，新增了“用户发送图片，机器人直接识别并回复”的能力。联调过程中，出现过两类典型问题：

1. 用户发图片后，机器人完全不回复。
2. 用户发图片后，机器人回复“当前系统开小差了，请稍后再试。”。

这份文档记录本次排障结论、修复点和后续迭代注意事项，避免重复踩坑。

## 真实消息形态

钉钉图片消息在真实 Stream 回调里，不一定是 `msgtype: "picture"`。

本次联调拿到的真实 payload 形态是：

```json
{
  "msgtype": "richText",
  "content": {
    "richText": [
      {
        "type": "picture",
        "downloadCode": "...",
        "pictureDownloadCode": "..."
      },
      { "text": "\n" },
      { "text": "这个里面是什么" }
    ]
  }
}
```

结论：

- 图片信息在 `content.richText[]` 里。
- 用户文字也在 `content.richText[]` 里。
- 不能只按 `message.text.content` 或 `msgtype === "picture"` 处理。

## 问题一：图片消息完全不回复

### 根因

旧逻辑只读取：

- `message.text.content`
- `msgtype === "picture"` 时的 `content.downloadCode`

而真实消息是 `msgtype: "richText"`。结果：

- 提取不到文字；
- 也提取不到图片下载码；
- handler 最终把消息当成空消息消费掉；
- 钉钉侧看起来就是机器人“不回复”。

### 修复

已在以下位置修复：

- `src/modules/dingtalk/stream-client.ts`
- `src/modules/dingtalk/stream-handler.ts`
- `src/modules/assistant/user-query.ts`

修复内容：

- 支持从 `content.richText[]` 提取用户文本；
- 支持从 `content.richText[]` 中图片节点提取 `downloadCode` / `pictureDownloadCode`；
- 下载钉钉图片并转换为 base64 data URL；
- 图片无文字时自动补默认问题：`请识别这张图片内容`。

## 问题二：图片消息回复“当前系统开小差了，请稍后再试。”

### 第一阶段根因

图片消息最初也会先走意图分类器。分类器调用视觉模型时：

- 图片请求更慢；
- 分类器本地超时较短；
- 超时/异常会退化成统一澄清兜底。

因此用户看到的是：

```text
当前系统开小差了，请稍后再试。
```

### 修复策略

最终采用的策略不是“继续优化图片分类”，而是：

**带 `imageUrl` 的请求直接跳过意图分类，直接走视觉回答生成。**

这样更符合当前产品诉求，也减少了一次不必要的模型调用。

已在以下位置修复：

- `src/modules/assistant/assistant.service.ts`
- `src/app/api/dingtalk/webhook/route.ts`
- `src/app/api/dingtalk/webhook/stream/route.ts`

当前行为：

- 普通文本仍先走 analyzer；
- 图片请求直接走 `responseGenerator.generate(...)`；
- stream 调试入口同样跳过 analyzer，避免出现线上与调试入口行为不一致。

## 问题三：第一张图成功，第二张图卡住或再次兜底

### 根因

这不是钉钉消息解析问题，而是视觉生成请求本地超时太短。

原先 `response-generator` 对图片请求的本地超时只有 `15s`：

```ts
const timeoutId = setTimeout(() => controller.abort(), 15000);
```

联调日志表明，视觉回答第二次请求可能超过 15 秒，于是：

- 请求被 `AbortController` 中断；
- `catch` 原来直接吞异常，不打印原因；
- 上层只看到 `null`；
- 最终再次落到“系统开小差”兜底。

### 修复

已在 `src/modules/assistant/response-generator.ts` 修复：

- 普通生成超时保留 `15s`；
- 视觉生成超时提升到 `45s`；
- 异常原因会输出到日志，不再静默吞掉。

当前关键日志形态：

```text
[response] request model="Qwen/Qwen3-VL-8B-Instruct" mode=open_response query="这是什么图片"
[response] response mode=open_response query="这是什么图片" generated=true
```

若失败，会看到：

```text
[response] response mode=open_response query="这是什么图片" failed reason="This operation was aborted"
```

## 本次改动概览

### 新增

- `src/modules/assistant/user-query.ts`

职责：

- 统一规范用户 query；
- 图片但无文字时补默认问题；
- `"[图片消息]"` 这类占位文案会自动归一化。

### 主要修改

- `src/modules/dingtalk/stream-client.ts`
  - 解析 `richText` 文本和图片；
  - 调用钉钉下载接口拿到图片并转成 base64；
  - 将 `imageUrl` 透传给后续链路。

- `src/modules/dingtalk/stream-handler.ts`
  - 统一使用 `resolveUserQuery`；
  - 把 `imageUrl` 传给 assistant。

- `src/modules/assistant/assistant.service.ts`
  - 图片请求跳过 analyzer；
  - 直接调用 response generator；
  - 失败时回统一兜底；
  - clarification 不再进入 response generator。

- `src/modules/assistant/response-generator.ts`
  - 支持视觉输入的 `image_url` 消息格式；
  - 增加 `AbortController` 超时控制；
  - 视觉请求超时调大到 `45s`；
  - 失败时打印明确原因。

- `src/app/api/dingtalk/webhook/route.ts`
  - 调试入口支持 `imageUrl`；
  - 使用统一 query 归一化逻辑。

- `src/app/api/dingtalk/webhook/stream/route.ts`
  - 流式调试入口支持 `imageUrl`；
  - 图片请求直接走 assistant，不再先走 analyzer。

## 已验证内容

本次至少确认过以下事实：

1. 真实钉钉 `richText` 图片消息已能被正确解析。
2. 图片消息会带着 `imageUrl` 进入 assistant。
3. assistant 会直接走视觉回答链路，不再先进意图分类。
4. 视觉生成成功时，日志能看到 `generated=true`。
5. 视觉生成失败时，日志能看到明确 `failed reason=...`。
6. 视觉生成本地超时窗口已增大到 `45s`。

## 联调注意事项

### 1. Stream 进程必须重启

`npm run stream:dev` 是常驻长连接进程。图片链路相关代码改完后，如果怀疑行为还是旧的，优先确认 stream 进程已经重启。

### 2. 重点看这些日志

图片联调时，优先观察：

- `[response] request model=...`
- `[response] response mode=... generated=true`
- `[response] response mode=... failed reason=...`
- `[stream] failed to download image from dingtalk: ...`
- `[stream] error handling message: ...`

### 3. 失败优先排查顺序

建议固定按以下顺序排查：

1. 是否拿到了真实 `richText` 图片 payload；
2. 是否成功解析出 `imageUrl`；
3. 是否进入 `response` 请求；
4. 是否在 `response` 处超时或异常；
5. 是否成功发回 `sessionWebhook`。

## 后续迭代建议

### 1. 把视觉超时做成环境变量

当前 `45s` 是代码常量。后续更稳妥的方式是增加例如：

- `SILICONFLOW_RESPONSE_TIMEOUT_MS`
- `SILICONFLOW_VISION_TIMEOUT_MS`

便于不同环境单独调优。

### 2. 补充回钉钉发送日志

当前已经能定位到模型侧问题，但若后续出现“模型成功生成，用户仍看不到回复”，建议继续增加：

- 发 `sessionWebhook` 前的消息摘要日志；
- `sessionWebhook` 响应状态码和响应体日志。

### 3. 清理测试隔离问题

本次功能相关测试已补充，但 `webhook/stream` 一些批量测试还存在 mock 隔离不稳定的问题。它不影响当前图片主链，但建议后续单独清理，避免回归验证噪音过大。
