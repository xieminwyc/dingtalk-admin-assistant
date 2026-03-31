import type { ReactNode } from "react";

import type { EntryMode } from "@/modules/assistant/entry-mode.types";

type IconProps = {
  className?: string;
};

function SvgShell({
  children,
  className,
  viewBox = "0 0 24 24",
}: IconProps & {
  children: ReactNode;
  viewBox?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox={viewBox}
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  );
}

export function CardGlyph({
  entryMode,
  className,
}: IconProps & { entryMode: EntryMode }) {
  const commonProps = {
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.75,
  };

  switch (entryMode) {
    case "knowledge":
      return (
        <SvgShell className={className}>
          <path d="M6.5 5.5h8a3 3 0 0 1 3 3v9.5H9a2.5 2.5 0 0 0-2.5 2.5V5.5Z" {...commonProps} />
          <path d="M9 18h8.5" {...commonProps} />
          <path d="M9 9h5.5" {...commonProps} />
          <path d="M9 12.5h5.5" {...commonProps} />
        </SvgShell>
      );
    case "contact":
      return (
        <SvgShell className={className}>
          <circle cx="9" cy="9" r="2.75" {...commonProps} />
          <path d="M4.75 16.25c.95-2.1 2.7-3.25 5.25-3.25s4.3 1.15 5.25 3.25" {...commonProps} />
          <path d="M17 8.25h4.25" {...commonProps} />
          <path d="M19.125 6.125V10.375" {...commonProps} />
        </SvgShell>
      );
    case "task":
      return (
        <SvgShell className={className}>
          <rect height="13" rx="2.5" width="11" x="6.5" y="5.5" {...commonProps} />
          <path d="M9 4.75h6" {...commonProps} />
          <path d="m9.25 10.25 1.75 1.75 3.5-3.5" {...commonProps} />
        </SvgShell>
      );
    case "image_placeholder":
      return (
        <SvgShell className={className}>
          <rect height="12" rx="2.5" width="13" x="5.5" y="6" {...commonProps} />
          <circle cx="10" cy="10" r="1.25" {...commonProps} />
          <path d="m7.75 16 3.25-3.25L13.5 15l1.25-1.25L17 16" {...commonProps} />
        </SvgShell>
      );
    case "writing":
      return (
        <SvgShell className={className}>
          <path d="m6.75 16.75-1 3.5 3.5-1 8.75-8.75-2.5-2.5-8.75 8.75Z" {...commonProps} />
          <path d="m13.75 8.25 2.5 2.5" {...commonProps} />
          <path d="M6.75 20.25h10.5" {...commonProps} />
        </SvgShell>
      );
  }
}

export function ArrowGlyph({ className }: IconProps) {
  return (
    <SvgShell className={className}>
      <path
        d="m10 7 5 5-5 5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </SvgShell>
  );
}

export function HistoryGlyph({ className }: IconProps) {
  return (
    <SvgShell className={className}>
      <path
        d="M6 7.25h12M6 12h12M6 16.75h8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </SvgShell>
  );
}

export function HomeGlyph({ className }: IconProps) {
  return (
    <SvgShell className={className}>
      <path
        d="m9 6.75-4.5 4.25M9 6.75 13.5 11"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
      <path
        d="M6.25 10.5V17h7.5v-6.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </SvgShell>
  );
}
