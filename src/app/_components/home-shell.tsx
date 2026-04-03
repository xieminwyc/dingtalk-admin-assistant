"use client";

import type { ChangeEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

import type { EntryMode } from "@/modules/assistant/entry-mode.types";
import {
  resolveDingTalkSenderIdentity,
  type ResolvedDingTalkSenderIdentity,
} from "@/modules/dingtalk/browser-identity";

import {
  homeEntryCards,
  quickLinks,
  recommendedTeammates,
} from "../home-config";
import { createStreamReplyAccumulator } from "./home-shell.stream";
import { ChatCanvas } from "./chat-canvas";
import { Composer } from "./composer";
import { DrilldownCanvas } from "./drilldown-canvas";
import { HistoryDrawer } from "./history-drawer";
import { HomeCanvas, HomeSupportSection } from "./home-canvas";
import { HistoryGlyph, HomeGlyph } from "./home-icons";
import type {
  ChatEntry,
  ChatEntryMeta,
  ChatCitation,
  ChatImage,
  ChatResultKind,
  ConversationSummary,
  HomeView,
} from "./home-shell.types";

type WebhookReply = {
  reply?: string;
  error?: string;
  citations?: ChatCitation[];
  images?: ChatImage[];
  kind?: ChatResultKind;
  meta?: ChatEntryMeta;
};

type WebhookStreamChunkEvent = {
  type: "chunk";
  content?: string;
};

type WebhookStreamDoneEvent = {
  type: "done";
  reply?: string;
  citations?: ChatCitation[];
  images?: ChatImage[];
  kind?: ChatResultKind;
  meta?: ChatEntryMeta;
};

type WebhookStreamErrorEvent = {
  type: "error";
  message?: string;
};

type WebhookStreamEvent =
  | WebhookStreamChunkEvent
  | WebhookStreamDoneEvent
  | WebhookStreamErrorEvent;

function createSessionId() {
  return `home-${Math.random().toString(36).slice(2, 10)}`;
}

const DEFAULT_PLACEHOLDER = "输入你想问的问题，或让我帮你写点什么";
const HOMEPAGE_SESSION_STORAGE_KEY = "homepage-session";

type StoredSession = {
  currentSessionId: string;
  sessions: Array<{
    sessionId: string;
    title: string;
    updatedAt: number;
    messages: ChatEntry[];
  }>;
};

async function readJsonReply(response: Response) {
  return (await response.json()) as WebhookReply;
}

async function resolveSenderStaffIdFromAuthCode(authCode: string) {
  const response = await fetch("/api/dingtalk/browser-identity", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      authCode,
      source: "oauth2",
    }),
  });

  if (!response.ok) {
    return undefined;
  }

  const payload = (await response.json()) as {
    senderStaffId?: string;
  };

  return payload.senderStaffId;
}


async function readStreamEvents(
  response: Response,
  handlers: {
    onChunk(event: WebhookStreamChunkEvent): void;
    onDone(event: WebhookStreamDoneEvent): void;
  },
) {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error("流式响应为空");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  const processBlock = (block: string) => {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.replace(/^data:\s*/u, ""))
      .join("\n")
      .trim();

    if (!data || data === "[DONE]") {
      return;
    }

    const event = JSON.parse(data) as WebhookStreamEvent;

    if (event.type === "chunk") {
      handlers.onChunk(event);
      return;
    }

    if (event.type === "done") {
      handlers.onDone(event);
      return;
    }

    throw new Error(event.message ?? "流式请求失败");
  };

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        processBlock(block);
      }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
      processBlock(buffer);
    }
  } finally {
    reader.releaseLock();
  }
}

export function HomeShell({
  dingtalkClientId,
}: {
  dingtalkClientId?: string;
}) {
  const [sessionId, setSessionId] = useState(createSessionId);
  const [view, setView] = useState<HomeView>("home");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [activeEntryMode, setActiveEntryMode] = useState<EntryMode | null>(
    null,
  );
  const [savedSessions, setSavedSessions] = useState<StoredSession["sessions"]>(
    [],
  );
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugSender, setDebugSender] = useState<
    | { status: "pending" }
    | { status: "ok"; identity: ResolvedDingTalkSenderIdentity }
    | { status: "error"; message: string }
  >({ status: "pending" });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const senderIdentityRef = useRef<ResolvedDingTalkSenderIdentity>({
    source: "unavailable",
  });
  const senderIdentityPromiseRef =
    useRef<Promise<ResolvedDingTalkSenderIdentity> | null>(null);

  const activeCard = activeEntryMode
    ? homeEntryCards.find((card) => card.entryMode === activeEntryMode)
    : null;
  const currentPlaceholder = activeCard?.placeholder ?? DEFAULT_PLACEHOLDER;
  const conversationSummaries: ConversationSummary[] = savedSessions.map(
    (session) => ({
      sessionId: session.sessionId,
      title: session.title,
      updatedAt: session.updatedAt,
      isCurrent: session.sessionId === sessionId,
    }),
  );

  useEffect(() => {
    try {
      const rawValue = window.localStorage.getItem(
        HOMEPAGE_SESSION_STORAGE_KEY,
      );

      if (!rawValue) {
        return;
      }

      const stored = JSON.parse(rawValue) as StoredSession;
      const currentSession = stored.sessions.find(
        (session) => session.sessionId === stored.currentSessionId,
      );

      if (!currentSession) {
        return;
      }

      setSessionId(stored.currentSessionId);
      setMessages(currentSession.messages);
      setSavedSessions(stored.sessions);

      if (currentSession.messages.length > 0) {
        setView("chat");
      }
    } catch {
      // Ignore malformed local data and fall back to a fresh session.
    }
  }, []);

  function ensureSenderIdentity() {
    if (!senderIdentityPromiseRef.current) {
      senderIdentityPromiseRef.current = resolveDingTalkSenderIdentity(window, {
        clientId: dingtalkClientId,
        resolveUserIdFromAuthCode: resolveSenderStaffIdFromAuthCode,
      })
        .then((identity) => {
          senderIdentityRef.current = identity;
          setDebugSender({ status: "ok", identity });
          console.info("[home] resolved dingtalk sender", {
            senderStaffId: identity.senderStaffId,
            source: identity.source,
            diagnostics: identity.diagnostics,
          });
          return identity;
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          setDebugSender({ status: "error", message });
          return { source: "unavailable" } as ResolvedDingTalkSenderIdentity;
        });
    }

    return senderIdentityPromiseRef.current;
  }

  useEffect(() => {
    void ensureSenderIdentity();
  }, [dingtalkClientId]);

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }

    const title = messages.find((message) => message.role === "user")?.content;

    if (!title) {
      return;
    }

    const nextSummary: ConversationSummary = {
      sessionId,
      title,
      updatedAt: Date.now(),
      isCurrent: true,
    };

    setSavedSessions((current) => {
      const remaining = current.filter(
        (summary) => summary.sessionId !== sessionId,
      );
      const nextSessions = [
        {
          sessionId: nextSummary.sessionId,
          title: nextSummary.title,
          updatedAt: nextSummary.updatedAt,
          messages,
        },
        ...remaining,
      ].slice(0, 10);

      window.localStorage.setItem(
        HOMEPAGE_SESSION_STORAGE_KEY,
        JSON.stringify({
          currentSessionId: sessionId,
          sessions: nextSessions,
        } satisfies StoredSession),
      );

      return nextSessions;
    });
  }, [messages, sessionId]);

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
      mode: resolvedEntryMode ?? null,
    };
    const thinkingId = `assistant-thinking-${Date.now()}`;

    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: thinkingId,
        role: "assistant",
        content: "AI 正在思考...",
        mode: resolvedEntryMode ?? null,
        isThinking: true,
      },
    ]);
    setDraft("");
    setError(null);
    setIsSending(true);
    setView("chat");
    setActiveEntryMode(resolvedEntryMode ?? null);

    if (textareaRef.current) {
      textareaRef.current.style.height = "";
    }

    try {
      const senderIdentity = senderIdentityRef.current.senderStaffId
        ? senderIdentityRef.current
        : await ensureSenderIdentity()?.catch(
            (): ResolvedDingTalkSenderIdentity => ({
              senderStaffId: undefined,
              source: "unavailable",
            }),
          );

      const response = await fetch("/api/dingtalk/webhook/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          entryMode: resolvedEntryMode,
          senderStaffId: senderIdentity?.senderStaffId,
          senderSource: senderIdentity?.source,
          senderDiagnostics: senderIdentity?.diagnostics,
          text: {
            content: message,
          },
        }),
      });
      const contentType = response.headers.get("Content-Type") ?? "";

      if (!response.ok) {
        if (contentType.includes("application/json")) {
          const payload = await readJsonReply(response);
          throw new Error(payload.error ?? "发送失败");
        }

        throw new Error(await response.text());
      }

      if (contentType.includes("text/event-stream")) {
        const replyAccumulator = createStreamReplyAccumulator({
          onFlush(nextReply) {
            replaceMessage(thinkingId, {
              id: thinkingId,
              role: "assistant",
              content: nextReply || "AI 正在思考...",
              mode: resolvedEntryMode ?? null,
            });
          },
        });
        let finalized = false;

        await readStreamEvents(response, {
          onChunk(event) {
            replyAccumulator.push(event.content ?? "");
          },
          onDone(event) {
            finalized = true;
            replyAccumulator.finalize();
            replaceMessage(thinkingId, {
              id: thinkingId,
              role: "assistant",
              content:
                event.reply ??
                replyAccumulator.getReply() ??
                "暂时没有拿到回复。",
              mode: resolvedEntryMode ?? null,
              kind: event.kind ?? null,
              citations: event.citations,
              images: event.images,
              meta: event.meta,
            });
          },
        });

        if (!finalized) {
          replyAccumulator.finalize();
          replaceMessage(thinkingId, {
            id: thinkingId,
            role: "assistant",
            content: replyAccumulator.getReply() || "暂时没有拿到回复。",
            mode: resolvedEntryMode ?? null,
          });
        }
      } else {
        const payload = await readJsonReply(response);

        replaceMessage(thinkingId, {
          id: thinkingId,
          role: "assistant",
          content: payload.reply ?? "暂时没有拿到回复。",
          mode: resolvedEntryMode ?? null,
          kind: payload.kind ?? null,
          citations: payload.citations,
          images: payload.images,
          meta: payload.meta,
        });
      }
    } catch (caughtError) {
      const errorMessage =
        caughtError instanceof Error ? caughtError.message : "发送失败";

      replaceMessage(thinkingId, {
        id: thinkingId,
        role: "assistant",
        content: "抱歉，这次没有成功返回结果，请稍后再试。",
        mode: resolvedEntryMode ?? null,
        isError: true,
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

  function handleCardActivate(entryMode: EntryMode) {
    setActiveEntryMode(entryMode);
    setError(null);
    setView("drilldown");
    focusComposer();
  }

  function handleFillExample(text: string, entryMode: EntryMode) {
    setActiveEntryMode(entryMode);
    setError(null);
    fillComposer(text);
  }

  function handleNewTopic() {
    const nextSessionId = createSessionId();

    setSessionId(nextSessionId);
    setDraft("");
    setMessages([]);
    setActiveEntryMode(null);
    setView("home");
    setError(null);
    setIsHistoryOpen(false);
    window.localStorage.setItem(
      HOMEPAGE_SESSION_STORAGE_KEY,
      JSON.stringify({
        currentSessionId: nextSessionId,
        sessions: savedSessions,
      } satisfies StoredSession),
    );
  }

  function handleSelectSession(targetSessionId: string) {
    const selectedSession = savedSessions.find(
      (session) => session.sessionId === targetSessionId,
    );

    if (!selectedSession) {
      return;
    }

    const lastMode =
      [...selectedSession.messages].reverse().find((message) => message.mode)
        ?.mode ?? null;

    const nextSessions = [
      {
        ...selectedSession,
        updatedAt: Date.now(),
      },
      ...savedSessions.filter(
        (session) => session.sessionId !== targetSessionId,
      ),
    ].slice(0, 10);

    setSessionId(selectedSession.sessionId);
    setMessages(selectedSession.messages);
    setActiveEntryMode(lastMode);
    setDraft("");
    setError(null);
    setView(selectedSession.messages.length > 0 ? "chat" : "home");
    setIsHistoryOpen(false);
    setSavedSessions(nextSessions);
    window.localStorage.setItem(
      HOMEPAGE_SESSION_STORAGE_KEY,
      JSON.stringify({
        currentSessionId: selectedSession.sessionId,
        sessions: nextSessions,
      } satisfies StoredSession),
    );
  }

  function handleReturnHome() {
    setView("home");
    setError(null);
  }

  const topbarSubtitle =
    view === "chat"
      ? "ACTIVE CONVERSATION"
      : view === "drilldown"
        ? "EXPERT MODE"
        : "PORTAL WORKSPACE";

  return (
    <main className="portal-shell" data-view={view}>
      <header className="portal-topbar">
        <button
          aria-label="历史记录"
          className="portal-history-trigger"
          type="button"
          onClick={() => setIsHistoryOpen((current) => !current)}
        >
          <HistoryGlyph className="portal-history-trigger-icon" />
        </button>

        {view !== "home" ? (
          <button
            aria-label="返回首页"
            className="portal-home-trigger"
            type="button"
            onClick={handleReturnHome}
          >
            <HomeGlyph className="portal-home-trigger-icon" />
          </button>
        ) : null}

        <div className="portal-topbar-brand">
          <span className="portal-topbar-brand-mark">AI</span>
          <span className="portal-topbar-brand-copy">
            <strong>万事通</strong>
            <span>{topbarSubtitle}</span>
          </span>
        </div>
      </header>

      <div
        style={{
          position: "fixed",
          bottom: 80,
          left: 0,
          right: 0,
          zIndex: 9999,
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        {debugSender.status === "pending" ? (
          <span
            style={{
              display: "inline-block",
              background: "rgba(0,0,0,0.65)",
              color: "#ccc",
              fontSize: 11,
              padding: "3px 10px",
              borderRadius: 4,
            }}
          >
            身份解析中…
          </span>
        ) : debugSender.status === "error" ? (
          <span
            style={{
              display: "inline-block",
              background: "rgba(180,0,0,0.85)",
              color: "#fff",
              fontSize: 11,
              padding: "3px 10px",
              borderRadius: 4,
            }}
          >
            uid 解析失败: {debugSender.message}
          </span>
        ) : (
          <span
            style={{
              display: "inline-block",
              background: "rgba(0,0,0,0.75)",
              color: "#fff",
              fontSize: 11,
              padding: "3px 10px",
              borderRadius: 4,
              letterSpacing: "0.02em",
              maxWidth: "90vw",
              wordBreak: "break-all",
            }}
          >
            uid: <strong>{debugSender.identity.senderStaffId ?? "(空)"}</strong>
            {" · "}src: {debugSender.identity.source}
            {debugSender.identity.diagnostics ? (
              <>
                {" · "}cid:
                {debugSender.identity.diagnostics.clientIdProvided
                  ? "Y"
                  : "N"}{" "}
                ua:{debugSender.identity.diagnostics.isDingTalkUa ? "Y" : "N"}{" "}
                oauth2:
                {debugSender.identity.diagnostics.oauth2CodeFromUrl ? "Y" : "N"}
              </>
            ) : null}
          </span>
        )}
      </div>

      <HistoryDrawer
        isOpen={isHistoryOpen}
        summaries={conversationSummaries}
        onClose={() => setIsHistoryOpen(false)}
        onNewTopic={handleNewTopic}
        onSelectSession={handleSelectSession}
      />

      {view === "home" ? (
        <HomeCanvas
          activeEntryMode={activeEntryMode}
          cards={homeEntryCards}
          onActivate={handleCardActivate}
          onFillExample={handleFillExample}
        />
      ) : null}

      {view === "drilldown" && activeCard ? (
        <DrilldownCanvas
          activeCard={activeCard}
          onFillExample={(text) =>
            handleFillExample(text, activeCard.entryMode)
          }
        />
      ) : null}

      {view === "chat" ? (
        <ChatCanvas isSending={isSending} messages={messages} />
      ) : null}

      <Composer
        currentPlaceholder={currentPlaceholder}
        draft={draft}
        error={error}
        isSending={isSending}
        textareaRef={textareaRef}
        onChange={handleComposerChange}
        onKeyDown={handleComposerKeyDown}
        onSend={() => void sendMessage(draft)}
      />

      {view === "home" ? (
        <HomeSupportSection
          quickLinks={quickLinks}
          recommendedTeammates={recommendedTeammates}
        />
      ) : null}
    </main>
  );
}
