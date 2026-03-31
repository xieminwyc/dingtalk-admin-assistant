import type { ChangeEvent, KeyboardEvent, RefObject } from "react";

type ComposerProps = {
  currentPlaceholder: string;
  draft: string;
  error: string | null;
  isSending: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
};

export function Composer({
  currentPlaceholder,
  draft,
  error,
  isSending,
  textareaRef,
  onChange,
  onKeyDown,
  onSend,
}: ComposerProps) {
  const isDisabled = isSending || !draft.trim();

  return (
    <div className="chat-composer portal-composer">
      <label className="composer-label" htmlFor="portal-message-input">
        输入消息
      </label>
      <textarea
        id="portal-message-input"
        className="composer-input"
        ref={textareaRef}
        value={draft}
        onChange={onChange}
        onKeyDown={onKeyDown}
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
          disabled={isDisabled}
          onClick={onSend}
          type="button"
        >
          {isSending ? "发送中..." : "发送"}
        </button>
      </div>
    </div>
  );
}
