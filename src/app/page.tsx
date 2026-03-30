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

  function handleCardSelect(entryMode: EntryMode) {
    setActiveEntryMode(entryMode);
    setError(null);
    focusComposer();
  }

  return (
    <main className="portal-shell">
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

      <section className="portal-card-grid">
        {homeEntryCards.map((card) => (
          <article
            key={card.title}
            className={`portal-entry-card${
              activeEntryMode === card.entryMode
                ? " portal-entry-card-active"
                : ""
            }`}
          >
            <div className="portal-entry-head">
              <div>
                <h2>{card.title}</h2>
                <p>{card.description}</p>
              </div>
              <button
                className="portal-entry-activate"
                onClick={() => handleCardSelect(card.entryMode)}
                type="button"
              >
                使用
              </button>
            </div>
            <p className="portal-entry-helper">{card.helper}</p>
            <button
              className="portal-entry-example"
              onClick={() =>
                void sendMessage(card.exampleQuestion, card.entryMode)
              }
              type="button"
            >
              {card.exampleQuestion}
            </button>
          </article>
        ))}
      </section>

      <section className="portal-team-card">
        <div className="portal-section-head">
          <h2>
            万事通的同事们 <span className="portal-badge">①</span>
          </h2>
          {activeEntryMode ? <span>当前：{activeEntryMode}</span> : null}
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

      <section className="portal-chat-card">
        <div className="portal-section-head">
          <h2>有问题尽管问我～</h2>
          <span>{isSending ? "处理中..." : ""}</span>
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
                className={`portal-chat-bubble portal-chat-bubble-${message.role}`}
              >
                <p className="portal-chat-role">
                  {message.role === "user" ? "你" : "万事通"}
                </p>
                <p>{message.content}</p>
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
            placeholder="输入你想问的问题，或让我帮你写点什么"
            rows={1}
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
