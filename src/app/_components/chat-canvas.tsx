import type { ChatCitation, ChatEntry, ChatResultKind } from "./home-shell.types";

type ChatCanvasProps = {
  isSending: boolean;
  messages: ChatEntry[];
};

type ChatSection = {
  label?: string;
  body: string;
};

const SOURCE_LABELS = new Set(["依据", "依据来源", "参考来源"]);

function splitSections(content: string): ChatSection[] {
  return content
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length <= 1) {
        return {
          body: lines[0] ?? "",
        };
      }

      return {
        label: lines[0],
        body: lines.slice(1).join("\n"),
      };
    })
    .filter((section) => section.body);
}

function deriveCitationEntries(message: ChatEntry, sections: ChatSection[]) {
  const citations = [...(message.citations ?? [])];
  const contentSections: ChatSection[] = [];

  for (const section of sections) {
    if (section.label && SOURCE_LABELS.has(section.label)) {
      citations.push({
        documentTitle: section.body,
      });
      continue;
    }

    contentSections.push(section);
  }

  return {
    citations,
    contentSections,
  };
}

function formatModeLabel(kind?: ChatResultKind | null, mode?: ChatEntry["mode"]) {
  const rawValue = kind ?? mode;

  if (!rawValue) {
    return null;
  }

  return rawValue.replace(/_/g, " ").toUpperCase();
}

function renderCitation(citation: ChatCitation, index: number) {
  if (citation.sourceUrl) {
    return (
      <a
        key={`${citation.documentTitle}-${index}`}
        className="portal-chat-citation"
        href={citation.sourceUrl}
        rel="noreferrer"
        target="_blank"
      >
        {citation.documentTitle}
      </a>
    );
  }

  return (
    <div
      key={`${citation.documentTitle}-${index}`}
      className="portal-chat-citation"
    >
      {citation.documentTitle}
    </div>
  );
}

export function ChatCanvas({ isSending, messages }: ChatCanvasProps) {
  return (
    <section className="portal-chat-card">
      <div className="portal-section-head">
        <h2>有问题尽管问我～</h2>
        {isSending ? (
          <span className="portal-sending-badge">处理中...</span>
        ) : null}
      </div>

      <div className="portal-chat-history">
        {messages.length === 0 ? (
          <div className="portal-chat-empty">
            有问题尽管问我。你可以点卡片示例问题，也可以直接在下面输入。
          </div>
        ) : (
          messages.map((message) => {
            const sections = splitSections(message.content);
            const { citations, contentSections } = deriveCitationEntries(
              message,
              sections,
            );
            const modeLabel = formatModeLabel(message.kind, message.mode);

            return (
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
                ) : message.role === "assistant" ? (
                  <div className="portal-chat-structured">
                    {contentSections.length > 0 ? (
                      contentSections.map((section, index) => (
                        <div key={`${section.label ?? "content"}-${index}`}>
                          {section.label ? (
                            <p className="portal-chat-section-label">
                              {section.label}
                            </p>
                          ) : null}
                          <p className="portal-chat-section-body">
                            {section.body}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="portal-chat-section-body">{message.content}</p>
                    )}

                    {citations.length > 0 ? (
                      <div className="portal-chat-citations">
                        <p className="portal-chat-citations-label">依据来源</p>
                        <div className="portal-chat-citations-list">
                          {citations.map(renderCitation)}
                        </div>
                      </div>
                    ) : null}

                    {modeLabel ? (
                      <div className="portal-chat-footer">
                        <span className="portal-chat-mode-badge">{modeLabel}</span>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p>{message.content}</p>
                )}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
