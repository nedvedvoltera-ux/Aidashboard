import type { ReactNode } from "react";

type GuidePanelProps = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
};

export function GuidePanel({ title, children, defaultOpen = true }: GuidePanelProps) {
  return (
    <details className="guide-panel" open={defaultOpen}>
      <summary className="guide-panel-summary">{title}</summary>
      <div className="guide-panel-body">{children}</div>
    </details>
  );
}
