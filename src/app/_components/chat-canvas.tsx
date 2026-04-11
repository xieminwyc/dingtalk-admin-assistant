"use client";

import { useEffect, useRef, useState } from "react";

import type {
  ChatCitation,
  ChatEntry,
  ChatImage,
  ChatResultKind,
} from "./home-shell.types";

type ChatCanvasProps = {
  isSending: boolean;
  messages: ChatEntry[];
};

type ChatSection = {
  label?: string;
  body: string;
};

type ChatBodyToken =
  | {
      type: "text";
      value: string;
    }
  | {
      type: "image";
      image: ChatImage;
    }
  | {
      type: "image-placeholder";
      imageName: string;
    };

type SectionRenderState = {
  section: ChatSection;
  tokens: ChatBodyToken[];
  referencedImageNames: string[];
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

function buildSectionRenderState(
  section: ChatSection,
  images: ChatImage[],
): SectionRenderState {
  const imageByName = new Map(images.map((image) => [image.name, image]));
  const referencedImageNames = new Set<string>();
  const tokens: ChatBodyToken[] = [];
  const pattern = /\{\{([^}]+)\}\}/gu;
  let lastIndex = 0;

  for (const match of section.body.matchAll(pattern)) {
    const matchText = match[0];
    const imageName = match[1]?.trim();
    const image = imageName ? imageByName.get(imageName) : undefined;
    const startIndex = match.index ?? 0;

    if (startIndex > lastIndex) {
      tokens.push({
        type: "text",
        value: section.body.slice(lastIndex, startIndex),
      });
    }

    if (image?.data) {
      referencedImageNames.add(image.name);
      tokens.push({
        type: "image",
        image,
      });
    } else {
      const resolvedImageName = image?.name ?? imageName;

      if (resolvedImageName) {
        referencedImageNames.add(resolvedImageName);
        tokens.push({
          type: "image-placeholder",
          imageName: resolvedImageName,
        });
      } else {
        tokens.push({
          type: "text",
          value: matchText,
        });
      }
    }

    lastIndex = startIndex + matchText.length;
  }

  if (lastIndex < section.body.length) {
    tokens.push({
      type: "text",
      value: section.body.slice(lastIndex),
    });
  }

  if (tokens.length === 0) {
    tokens.push({
      type: "text",
      value: section.body,
    });
  }

  return {
    section,
    tokens,
    referencedImageNames: [...referencedImageNames],
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

function renderImage(
  image: ChatImage,
  index: number,
  onOpen: (image: ChatImage) => void,
) {
  return (
    <div
      key={`${image.name}-${index}`}
      className="portal-chat-image-card"
    >
      {image.data ? (
        <button
          type="button"
          className="portal-chat-image-trigger"
          onClick={() => onOpen(image)}
        >
          <img
            alt={image.preview ?? image.name}
            className="portal-chat-image"
            src={`data:image/png;base64,${image.data}`}
          />
        </button>
      ) : null}
      <div className="portal-chat-image-meta">
        <p className="portal-chat-image-name">{image.name}</p>
        {image.preview ? (
          <p className="portal-chat-image-preview">{image.preview}</p>
        ) : null}
      </div>
    </div>
  );
}

export function ChatCanvas({ isSending, messages }: ChatCanvasProps) {
  const [previewImage, setPreviewImage] = useState<ChatImage | null>(null);
  const chatHistoryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 先尝试滚动容器
    if (chatHistoryRef.current) {
      const container = chatHistoryRef.current;
      const isScrollable = container.scrollHeight > container.clientHeight;

      if (isScrollable) {
        container.scrollTop = container.scrollHeight;
        return;
      }
    }

    // 如果容器不可滚动，滚动整个页面
    window.scrollTo({
      top: document.body.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  return (
    <>
      <section className="portal-chat-card">
        <div className="portal-section-head">
          <h2>有问题尽管问我～</h2>
          {isSending ? (
            <span className="portal-sending-badge">处理中...</span>
          ) : null}
        </div>

        <div className="portal-chat-history" ref={chatHistoryRef}>
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
              const sectionRenderStates = contentSections.map((section) =>
                buildSectionRenderState(section, message.images ?? []),
              );
              const referencedImageNames = new Set(
                sectionRenderStates.flatMap(
                  (sectionState) => sectionState.referencedImageNames,
                ),
              );
              const galleryImages = (message.images ?? []).filter(
                (image) => !referencedImageNames.has(image.name),
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
                      {sectionRenderStates.length > 0 ? (
                        sectionRenderStates.map((sectionState, index) => (
                          <div
                            key={`${sectionState.section.label ?? "content"}-${index}`}
                          >
                            {sectionState.section.label ? (
                              <p className="portal-chat-section-label">
                                {sectionState.section.label}
                              </p>
                            ) : null}
                            <div className="portal-chat-section-body">
                              {sectionState.tokens.map((token, tokenIndex) =>
                                token.type === "text" ? (
                                  <span key={`text-${tokenIndex}`}>
                                    {token.value}
                                  </span>
                                ) : token.type === "image" ? (
                                  <div
                                    key={`image-${token.image.name}-${tokenIndex}`}
                                    className="portal-chat-inline-image-card"
                                  >
                                    <button
                                      type="button"
                                      className="portal-chat-inline-image-trigger"
                                      onClick={() => setPreviewImage(token.image)}
                                    >
                                      <img
                                        alt={token.image.preview ?? token.image.name}
                                        className="portal-chat-inline-image"
                                        src={`data:image/png;base64,${token.image.data}`}
                                      />
                                    </button>
                                    <div className="portal-chat-inline-image-meta">
                                      <p className="portal-chat-inline-image-name">
                                        {token.image.name}
                                      </p>
                                      {token.image.preview ? (
                                        <p className="portal-chat-inline-image-preview">
                                          {token.image.preview}
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>
                                ) : (
                                  <div
                                    key={`image-placeholder-${token.imageName}-${tokenIndex}`}
                                    className="portal-chat-inline-image-card portal-chat-inline-image-placeholder-card"
                                  >
                                    <div
                                      aria-hidden="true"
                                      className="portal-chat-inline-image-placeholder-box"
                                    />
                                    <div className="portal-chat-inline-image-meta">
                                      <p className="portal-chat-inline-image-name">
                                        {token.imageName}
                                      </p>
                                      <p className="portal-chat-inline-image-preview">
                                        图片加载中
                                      </p>
                                    </div>
                                  </div>
                                ),
                              )}
                            </div>
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

                      {galleryImages.length > 0 ? (
                        <div className="portal-chat-citations">
                          <p className="portal-chat-citations-label">引用图片</p>
                          <div className="portal-chat-images">
                            {galleryImages.map((image, index) =>
                              renderImage(image, index, setPreviewImage),
                            )}
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
                    <>
                      <p>{message.content}</p>
                      {message.images && message.images.length > 0 ? (
                        <div className="portal-chat-images">
                          {message.images.map((image, index) => (
                            <div
                              key={`user-${image.name}-${index}`}
                              className="portal-chat-image-card"
                            >
                              {image.preview ? (
                                <img
                                  alt={image.name}
                                  className="portal-chat-image"
                                  src={image.preview}
                                />
                              ) : null}
                              <div className="portal-chat-image-meta">
                                <p className="portal-chat-image-name">{image.name}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  )}
                </article>
              );
            })
          )}
        </div>
      </section>

      {previewImage?.data ? (
        <div
          className="portal-image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${previewImage.name} 预览`}
        >
          <button
            type="button"
            className="portal-image-lightbox-backdrop"
            aria-hidden="true"
            onClick={() => setPreviewImage(null)}
          />
          <div className="portal-image-lightbox-card">
            <button
              type="button"
              className="portal-image-lightbox-close"
              aria-label="关闭预览"
              onClick={() => setPreviewImage(null)}
            >
              关闭
            </button>
            <img
              alt={previewImage.preview ?? previewImage.name}
              className="portal-image-lightbox-image"
              src={`data:image/png;base64,${previewImage.data}`}
            />
            <div className="portal-image-lightbox-meta">
              <p className="portal-chat-image-name">{previewImage.name}</p>
              {previewImage.preview ? (
                <p className="portal-chat-image-preview">{previewImage.preview}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
