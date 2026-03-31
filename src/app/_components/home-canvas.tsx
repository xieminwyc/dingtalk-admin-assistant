import type { EntryMode } from "@/modules/assistant/entry-mode.types";

import type { HomeEntryCard } from "../home-config";
import { ArrowGlyph, CardGlyph } from "./home-icons";

type HomeCanvasProps = {
  activeEntryMode: EntryMode | null;
  cards: HomeEntryCard[];
  onActivate: (entryMode: EntryMode) => void;
  onFillExample: (text: string, entryMode: EntryMode) => void;
};

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

export function HomeCanvas({
  activeEntryMode,
  cards,
  onActivate,
  onFillExample,
}: HomeCanvasProps) {
  return (
    <>
      <section className="portal-hero">
        <div className="portal-brand-mark">万</div>
        <div className="portal-hero-copy">
          <p className="portal-greeting">{buildGreeting()}</p>
          <h1>今天想先处理什么？</h1>
          <p>选一个入口，或直接发消息</p>
        </div>
      </section>

      <section className="portal-card-grid">
        {cards.map((card) => (
          <article
            key={card.title}
            className={`portal-entry-card${
              activeEntryMode === card.entryMode
                ? " portal-entry-card-active"
                : ""
            } portal-entry-card-${card.entryMode}`}
            onClick={() => onActivate(card.entryMode)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onActivate(card.entryMode);
              }
            }}
            aria-pressed={activeEntryMode === card.entryMode}
          >
            <div className="portal-entry-topline">
              <span className="portal-entry-icon-shell" aria-hidden="true">
                <CardGlyph
                  className="portal-entry-icon"
                  entryMode={card.entryMode}
                />
              </span>
              <span className="portal-entry-arrow-shell" aria-hidden="true">
                <ArrowGlyph className="portal-entry-arrow" />
              </span>
            </div>

            <div className="portal-entry-head">
              <div>
                <h2>{card.title}</h2>
                <p>{card.description}</p>
              </div>
              {card.isPlaceholder ? (
                <span className="portal-entry-soon">Soon</span>
              ) : activeEntryMode === card.entryMode ? (
                <span className="portal-entry-active-dot" aria-hidden="true" />
              ) : null}
            </div>
            <button
              aria-label={card.exampleQuestion}
              className="portal-entry-example"
              onClick={(event) => {
                event.stopPropagation();
                onFillExample(card.exampleQuestion, card.entryMode);
              }}
              type="button"
              title="点击填入输入框"
            >
              {card.exampleQuestion}
            </button>
          </article>
        ))}
      </section>

    </>
  );
}

type HomeSupportSectionProps = {
  quickLinks: string[];
  recommendedTeammates: string[];
};

export function HomeSupportSection({
  quickLinks,
  recommendedTeammates,
}: HomeSupportSectionProps) {
  return (
    <section className="portal-team-card">
      <div className="portal-section-head">
        <h2>
          同事们 <span className="portal-badge">①</span>
        </h2>
      </div>
      <div className="portal-team-list">
        {recommendedTeammates.map((teammate) => (
          <div key={teammate} className="portal-teammate-pill">
            <span className="portal-teammate-icon">AI</span>
            <strong>{teammate}</strong>
          </div>
        ))}
      </div>
      <div className="portal-quick-links">
        {quickLinks.map((link) => (
          <span key={link} className="portal-quick-link">
            <span className="portal-quick-link-icon" aria-hidden="true">
              ↗
            </span>
            {link}
          </span>
        ))}
      </div>
    </section>
  );
}
