"use client";

import type {
  ChangeEvent,
  ClipboardEvent,
  KeyboardEvent,
  RefObject,
} from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ComposerImage = {
  name: string;
  previewUrl: string;
};

type ComposerProps = {
  currentPlaceholder: string;
  draft: string;
  error: string | null;
  images: ComposerImage[];
  isSending: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onRemoveImage: (index: number) => void;
  onSend: () => void;
};

export function Composer({
  currentPlaceholder,
  draft,
  error,
  images,
  isSending,
  textareaRef,
  onChange,
  onPaste,
  onKeyDown,
  onRemoveImage,
  onSend,
}: ComposerProps) {
  const [previewImage, setPreviewImage] = useState<ComposerImage | null>(null);
  const [mounted, setMounted] = useState(false);
  const isDisabled = isSending || (!draft.trim() && images.length === 0);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="chat-composer portal-composer">
      <label className="composer-label" htmlFor="portal-message-input">
        输入消息
      </label>
      <div className="composer-input-wrapper">
        {images.length > 0 && !isSending ? (
          <div className="composer-image-inline-list" aria-live="polite">
            {images.map((image, index) => (
              <div key={`${image.name}-${index}`} className="composer-image-inline">
                <img
                  alt={image.name}
                  className="composer-image-inline-thumb"
                  src={image.previewUrl}
                />
                <div className="composer-image-inline-actions">
                  <button
                    className="composer-image-inline-btn composer-image-inline-view"
                    onClick={() => setPreviewImage(image)}
                    type="button"
                    aria-label="查看图片"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                  <button
                    className="composer-image-inline-btn composer-image-inline-remove"
                    onClick={() => onRemoveImage(index)}
                    type="button"
                    aria-label="移除"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <textarea
          id="portal-message-input"
          className="composer-input"
          ref={textareaRef}
          value={draft}
          onChange={onChange}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
          placeholder={currentPlaceholder}
          rows={1}
          disabled={isSending}
        />
      </div>
      <div className="composer-actions">
        <div className="composer-actions-left">
          {error ? (
            <p className="composer-error">{error}</p>
          ) : (
            <span className="portal-input-hint">Shift + Enter 换行，Ctrl/Cmd + V 粘贴图片</span>
          )}
        </div>
        <button
          className="composer-button"
          disabled={isDisabled}
          onClick={onSend}
          type="button"
        >
          {isSending ? "发送中..." : "发送"}
        </button>
      </div>

      {mounted && previewImage
        ? createPortal(
            <div
              className="composer-image-lightbox"
              role="dialog"
              aria-modal="true"
              aria-label={`${previewImage.name} 预览`}
            >
              <button
                type="button"
                className="composer-image-lightbox-backdrop"
                aria-hidden="true"
                onClick={() => setPreviewImage(null)}
              />
              <div className="composer-image-lightbox-card">
                <button
                  type="button"
                  className="composer-image-lightbox-close"
                  aria-label="关闭预览"
                  onClick={() => setPreviewImage(null)}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
                <img
                  alt={previewImage.name}
                  className="composer-image-lightbox-image"
                  src={previewImage.previewUrl}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
