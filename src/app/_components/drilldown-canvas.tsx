import type { HomeEntryCard } from "../home-config";
import { CardGlyph } from "./home-icons";

type DrilldownCanvasProps = {
  activeCard: HomeEntryCard;
  onFillExample: (text: string) => void;
};

export function DrilldownCanvas({
  activeCard,
  onFillExample,
}: DrilldownCanvasProps) {
  const templates =
    activeCard.templates && activeCard.templates.length > 0
      ? activeCard.templates
      : [
          {
            label: activeCard.exampleQuestion,
            prompt: activeCard.exampleQuestion,
          },
          ...activeCard.quickTags.map((tag) => ({
            label: tag.label,
            prompt: tag.fillText,
          })),
        ];

  return (
    <section
      className="portal-drilldown-card"
      data-mode={activeCard.entryMode}
    >
      <div className="portal-drilldown-header">
        <span className="portal-drilldown-icon-shell" aria-hidden="true">
          <CardGlyph
            className="portal-drilldown-icon"
            entryMode={activeCard.entryMode}
          />
        </span>
        <div className="portal-drilldown-copy">
          <h2>{activeCard.title}专家模式</h2>
          <p>{activeCard.helper}</p>
        </div>
      </div>

      {activeCard.isPlaceholder ? (
        <div className="portal-drilldown-placeholder">
          发票识别能力尚未上线。我可以先帮你整理票据类型、识别字段和使用场景，等 OCR 能力接入后可直接复用。
        </div>
      ) : null}

      <div className="portal-drilldown-content">
        <p className="portal-drilldown-label">推荐查询方案</p>
        <div className="portal-drilldown-list">
          {templates.map((template) => (
            <button
              key={`${template.label}-${template.prompt}`}
              className="portal-drilldown-item"
              type="button"
              onClick={() => onFillExample(template.prompt)}
            >
              <span className="portal-drilldown-item-title">
                {template.label}
              </span>
              <span className="portal-drilldown-item-copy">
                {template.prompt}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
