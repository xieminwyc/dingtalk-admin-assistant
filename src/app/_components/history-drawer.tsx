import type { ConversationSummary } from "./home-shell.types";

type HistoryDrawerProps = {
  isOpen: boolean;
  summaries: ConversationSummary[];
  onClose: () => void;
  onNewTopic: () => void;
  onSelectSession: (sessionId: string) => void;
};

function formatHistoryTime(updatedAt: number) {
  const date = new Date(updatedAt);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");

  return `${month}-${day} ${hour}:${minute}`;
}

export function HistoryDrawer({
  isOpen,
  summaries,
  onClose,
  onNewTopic,
  onSelectSession,
}: HistoryDrawerProps) {
  return (
    <>
      {isOpen ? (
        <button
          aria-label="关闭历史记录"
          className="portal-history-backdrop"
          type="button"
          onClick={onClose}
        />
      ) : null}

      <aside
        aria-hidden={!isOpen}
        className={`portal-history-drawer${
          isOpen ? " portal-history-drawer-open" : ""
        }`}
      >
        <div className="portal-history-header">
          <h2>历史记录</h2>
          <button type="button" onClick={onClose}>
            收起
          </button>
        </div>

        <button
          className="portal-history-new-topic"
          type="button"
          onClick={onNewTopic}
        >
          开启新话题
        </button>

        <div className="portal-history-list">
          {summaries.length === 0 ? (
            <div className="portal-history-empty">
              还没有历史对话。你可以先从首页卡片开始，或直接输入一个问题。
            </div>
          ) : (
            summaries.map((summary) => (
              <button
                key={summary.sessionId}
                className={`portal-history-item${
                  summary.isCurrent ? " portal-history-item-current" : ""
                }`}
                type="button"
                onClick={() => onSelectSession(summary.sessionId)}
              >
                <span className="portal-history-item-indicator" aria-hidden="true" />
                <span className="portal-history-item-copy">
                  <span className="portal-history-item-title">{summary.title}</span>
                  <span className="portal-history-item-meta">
                    {summary.isCurrent ? "当前会话" : "继续查看"} ·{" "}
                    {formatHistoryTime(summary.updatedAt)}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
