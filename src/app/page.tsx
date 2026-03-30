"use client";

import type { ChangeEvent, KeyboardEvent } from "react";
import { useRef, useState } from "react";

type DebugIntent = {
  mode?: string;
  source?: string;
  toolPlan?: string;
  knowledgeHint?: string;
  taskHint?: string;
};

type DebugResolution = {
  kind?: string;
  intent?: string;
  referenceLabel?: string;
  reason?: string;
  reasonCode?: string;
  relatedKeywords?: string[];
  title?: string;
};

type DebugTurn = {
  role: "user" | "assistant";
  content: string;
};

type DebugPayload = {
  conversationContext?: DebugTurn[];
  intent?: DebugIntent;
  resolution?: DebugResolution;
  usedResponseGenerator?: boolean;
};

type ChatEntry = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type WebhookReply = {
  reply: string;
  debug?: DebugPayload;
};

function createSessionId() {
  return `debug-${Math.random().toString(36).slice(2, 10)}`;
}

export default function Home() {
  const [sessionId] = useState(createSessionId);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [debug, setDebug] = useState<DebugPayload | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  function resizeComposer() {
    if (!textareaRef.current) {
      return;
    }

    // 输入框默认保持单行高度；只有真的换行时，才按内容自然撑开。
    textareaRef.current.style.height = "0px";
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  }

  async function handleSend() {
    const message = draft.trim();

    if (!message || isSending) {
      return;
    }

    const userMessage: ChatEntry = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message
    };

    setMessages((current) => [...current, userMessage]);
    setDraft("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "";
    }
    setIsSending(true);
    setError(null);

    try {
      const response = await fetch("/api/dingtalk/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          debug: true,
          sessionId,
          text: {
            content: message
          }
        })
      });

      const payload = (await response.json()) as WebhookReply & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "调试请求失败");
      }

      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: payload.reply
        }
      ]);
      setDebug(payload.debug ?? null);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "调试请求失败"
      );
    } finally {
      setIsSending(false);
    }
  }

  function handleComposerChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setDraft(event.target.value);
    resizeComposer();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  return (
    <main className="debug-shell">
      <section className="debug-card debug-hero">
        <p className="status-eyebrow">DingTalk Bot Debug</p>
        <h1>网页调试聊天</h1>
        <p className="status-description">
          这里直接复用 <code>/api/dingtalk/webhook</code>，但会带上调试信息返回，方便你在浏览器里看每轮的判定、路由和回复结果。
        </p>
      </section>

      <section className="debug-grid">
        <section className="debug-card chat-card">
          <div className="chat-header">
            <div>
              <h2>调试会话</h2>
              <p>Session: {sessionId}</p>
            </div>
          </div>

          <div className="chat-history">
            {messages.length === 0 ? (
              <div className="chat-empty">
                先发一句话试试，比如“迟到扣钱制度”“深圳天气怎么样”“我要请假”。
              </div>
            ) : (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={`chat-bubble chat-bubble-${message.role}`}
                >
                  <p className="chat-role">
                    {message.role === "user" ? "你" : "助手"}
                  </p>
                  <p>{message.content}</p>
                </article>
              ))
            )}
          </div>

          <div className="chat-composer">
            <label className="composer-label" htmlFor="debug-message-input">
              输入消息
            </label>
            <textarea
              id="debug-message-input"
              className="composer-input"
              ref={textareaRef}
              value={draft}
              onChange={handleComposerChange}
              onKeyDown={handleComposerKeyDown}
              placeholder="输入你想测试的话术"
              rows={1}
            />
            <div className="composer-actions">
              {error ? <p className="composer-error">{error}</p> : null}
              <button
                className="composer-button"
                disabled={isSending}
                onClick={handleSend}
                type="button"
              >
                {isSending ? "发送中..." : "发送并调试"}
              </button>
            </div>
          </div>
        </section>

        <aside className="debug-card panel-card">
          <h2>本轮调试信息</h2>

          <dl className="debug-panel">
            <div>
              <dt>decision.mode</dt>
              <dd>{debug?.intent?.mode ?? "-"}</dd>
            </div>
            <div>
              <dt>decision.source</dt>
              <dd>{debug?.intent?.source ?? "-"}</dd>
            </div>
            <div>
              <dt>toolPlan</dt>
              <dd>{debug?.intent?.toolPlan ?? "-"}</dd>
            </div>
            <div>
              <dt>knowledgeHint</dt>
              <dd>{debug?.intent?.knowledgeHint ?? "-"}</dd>
            </div>
            <div>
              <dt>taskHint</dt>
              <dd>{debug?.intent?.taskHint ?? "-"}</dd>
            </div>
            <div>
              <dt>resolution.kind</dt>
              <dd>{debug?.resolution?.kind ?? "-"}</dd>
            </div>
            <div>
              <dt>referenceLabel</dt>
              <dd>{debug?.resolution?.referenceLabel ?? "-"}</dd>
            </div>
            <div>
              <dt>reasonCode</dt>
              <dd>{debug?.resolution?.reasonCode ?? "-"}</dd>
            </div>
            <div>
              <dt>usedResponseGenerator</dt>
              <dd>{debug?.usedResponseGenerator ? "true" : "false"}</dd>
            </div>
            <div className="debug-panel-wide">
              <dt>relatedKeywords</dt>
              <dd>
                {debug?.resolution?.relatedKeywords?.length
                  ? debug.resolution.relatedKeywords.join("、")
                  : "-"}
              </dd>
            </div>
            <div className="debug-panel-wide">
              <dt>conversationContext</dt>
              <dd className="context-list">
                {debug?.conversationContext?.length ? (
                  debug.conversationContext.map((turn, index) => (
                    <p key={`${turn.role}-${index}`}>
                      <strong>{turn.role}:</strong> {turn.content}
                    </p>
                  ))
                ) : (
                  <span>-</span>
                )}
              </dd>
            </div>
          </dl>
        </aside>
      </section>
    </main>
  );
}
