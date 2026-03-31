"use client";

import type { ChangeEvent, KeyboardEvent } from "react";
import { useRef, useState } from "react";

import type { EntryMode } from "@/modules/assistant/entry-mode.types";

import {
  homeEntryCards,
  quickLinks,
  recommendedTeammates,
} from "./home-config";

type ChatEntry = {
  id: string;
  role: "user" | "assistant";
  content: string;
  isThinking?: boolean;
};

type WebhookReply = {
  reply?: string;
  error?: string;
};

function createSessionId() {
  return `home-${Math.random().toString(36).slice(2, 10)}`;
}

function buildGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "早上好";
  }

  if (hour < 18) {
    return "下午好";
  }

  return "晚上好";
}

const DEFAULT_PLACEHOLDER = "输入你想问的问题，或让我帮你写点什么";

export default function Home() {
  const [sessionId] = useState(createSessionId);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [activeEntryMode, setActiveEntryMode] = useState<EntryMode | null>(
    null,
  );
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Find the active card config for mode panel
  const activeCard = activeEntryMode
    ? homeEntryCards.find((c) => c.entryMode === activeEntryMode)
    : null;

  const currentPlaceholder = activeCard?.placeholder ?? DEFAULT_PLACEHOLDER;

  function resizeComposer() {
    if (!textareaRef.current) {
      return;
    }

    textareaRef.current.style.height = "0px";
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  }

  function focusComposer() {
    textareaRef.current?.focus();
  }

  function fillComposer(text: string) {
    setDraft(text);
    focusComposer();
    // allow DOM update before resize
    setTimeout(resizeComposer, 0);
  }

  function replaceMessage(messageId: string, nextMessage: ChatEntry) {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? nextMessage : message,
      ),
    );
  }

  async function sendMessage(rawMessage: string, entryMode?: EntryMode | null) {
    const message = rawMessage.trim();

    if (!message || isSending) {
      return;
    }

    const resolvedEntryMode = entryMode ?? activeEntryMode ?? undefined;
    const userMessage: ChatEntry = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message,
    };
    const thinkingId = `assistant-thinking-${Date.now()}`;

    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: thinkingId,
        role: "assistant",
        content: "AI 正在思考...",
        isThinking: true,
      },
    ]);
    setDraft("");
    setError(null);
    setIsSending(true);
    setActiveEntryMode(resolvedEntryMode ?? null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "";
    }

    try {
      const response = await fetch("/api/dingtalk/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          entryMode: resolvedEntryMode,
          text: {
            content: message,
          },
        }),
      });
      const payload = (await response.json()) as WebhookReply;

      if (!response.ok) {
        throw new Error(payload.error ?? "发送失败");
      }

      replaceMessage(thinkingId, {
        id: thinkingId,
        role: "assistant",
        content: payload.reply ?? "暂时没有拿到回复。",
      });
    } catch (caughtError) {
      const errorMessage =
        caughtError instanceof Error ? caughtError.message : "发送失败";

      replaceMessage(thinkingId, {
        id: thinkingId,
        role: "assistant",
        content: "抱歉，这次没有成功返回结果，请稍后再试。",
      });
      setError(errorMessage);
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
      void sendMessage(draft);
    }
  }

  // Click the card body → activate mode + focus input (no auto-send)
  function handleCardActivate(entryMode: EntryMode) {
    setActiveEntryMode(entryMode);
    setError(null);
    focusComposer();
  }

  // Click an example question or quick tag → fill input (not send)
  function handleFillExample(text: string, entryMode: EntryMode) {
    setActiveEntryMode(entryMode);
    setError(null);
    fillComposer(text);
  }

  return (
    <main className="portal-shell">
      {/* ── Hero ── */}
      <section className="portal-hero">
        <div className="portal-brand-mark">万</div>
        <div className="portal-hero-copy">
          <p className="portal-greeting">{buildGreeting()}</p>
          <h1>我是万事通，您的全能 AI 工作搭子</h1>
          <p>
            我能帮你查制度、找对接人、找流程，也可以协助你写作。后续图片生成等能力也会继续接进来。
          </p>
        </div>
      </section>

      {/* ── Entry Cards ── */}
      <section className="portal-card-grid">
        {homeEntryCards.map((card) => (
          <article
            key={card.title}
            className={`portal-entry-card${
              activeEntryMode === card.entryMode
                ? " portal-entry-card-active"
                : ""
            }`}
            onClick={() => handleCardActivate(card.entryMode)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleCardActivate(card.entryMode);
              }
            }}
            aria-pressed={activeEntryMode === card.entryMode}
          >
            <div className="portal-entry-head">
              <div>
                <h2>{card.title}</h2>
                <p>{card.description}</p>
              </div>
              {activeEntryMode === card.entryMode && (
                <span className="portal-entry-active-dot" aria-hidden="true" />
              )}
            </div>
            <p className="portal-entry-helper">{card.helper}</p>
            <button
              className="portal-entry-example"
              onClick={(e) => {
                e.stopPropagation();
                handleFillExample(card.exampleQuestion, card.entryMode);
              }}
              type="button"
              title="点击填入输入框"
            >
              {card.exampleQuestion}
            </button>
          </article>
        ))}
      </section>

      {/* ── Immersive Mode Panel ── */}
      {activeCard && (
        <section className="portal-mode-panel">
          <div className="portal-mode-panel-header">
            <span className="portal-mode-label">当前：{activeCard.title}</span>
            <button
              className="portal-mode-clear"
              type="button"
              onClick={() => setActiveEntryMode(null)}
            >
              ✕ 退出模式
            </button>
          </div>

          {activeCard.entryMode === "image_placeholder" ? (
            <p className="portal-mode-hint">
              🖼️ 图片生成能力即将上线，你可以先描述你的想法，我们会尽快接入。
            </p>
          ) : activeCard.quickTags.length > 0 ? (
            <div className="portal-mode-tags">
              {activeCard.quickTags.map((tag) => (
                <button
                  key={tag.label}
                  className="portal-mode-tag"
                  type="button"
                  onClick={() =>
                    handleFillExample(tag.fillText, activeCard.entryMode)
                  }
                >
                  {tag.label}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      )}

      {/* ── Teammates & Quick Links ── */}
      <section className="portal-team-card">
        <div className="portal-section-head">
          <h2>
            万事通的同事们 <span className="portal-badge">①</span>
          </h2>
        </div>
        <div className="portal-team-list">
          {recommendedTeammates.map((teammate) => (
            <div key={teammate} className="portal-teammate-pill">
              <span className="portal-teammate-icon">AI</span>
              {teammate}
            </div>
          ))}
        </div>
        <div className="portal-quick-links">
          {quickLinks.map((link) => (
            <span key={link} className="portal-quick-link">
              🔗 {link}
            </span>
          ))}
        </div>
      </section>

      {/* ── Chat ── */}
      <section className="portal-chat-card">
        <div className="portal-section-head">
          <h2>有问题尽管问我～</h2>
          {isSending && (
            <span className="portal-sending-badge">处理中...</span>
          )}
        </div>

        <div className="portal-chat-history">
          {messages.length === 0 ? (
            <div className="portal-chat-empty">
              有问题尽管问我。你可以点卡片示例问题，也可以直接在下面输入。
            </div>
          ) : (
            messages.map((message) => (
              <article
                key={message.id}
                className={`portal-chat-bubble portal-chat-bubble-${message.role}${
                  message.isThinking ? " portal-chat-bubble-thinking" : ""
                }`}
              >
                <p className="portal-chat-role">
                  {message.role === "user" ? "你" : "万事通"}
                </p>
                {message.isThinking ? (
                  <div className="portal-thinking-dots">
                    <span />
                    <span />
                    <span />
                  </div>
                ) : (
                  <p>{message.content}</p>
                )}
              </article>
            ))
          )}
        </div>

        <div className="chat-composer portal-composer">
          <label className="composer-label" htmlFor="portal-message-input">
            输入消息
          </label>
          <textarea
            id="portal-message-input"
            className="composer-input"
            ref={textareaRef}
            value={draft}
            onChange={handleComposerChange}
            onKeyDown={handleComposerKeyDown}
            placeholder={currentPlaceholder}
            rows={1}
            disabled={isSending}
          />
          <div className="composer-actions">
            {error ? (
              <p className="composer-error">{error}</p>
            ) : (
              <span className="portal-input-hint">Shift + Enter 换行</span>
            )}
            <button
              className="composer-button"
              disabled={isSending}
              onClick={() => void sendMessage(draft)}
              type="button"
            >
              {isSending ? "发送中..." : "发送"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
