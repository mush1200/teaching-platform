import type { ReactNode } from "react";
import { SectionHeader } from "./SectionHeader";

type Props = {
  title: string;
  icon?: string;
  subtitle?: string;
  actionHref?: string;
  actionLabel?: string;
  children: ReactNode;
  className?: string;
  id?: string;
};

export function Section({
  title,
  icon,
  subtitle,
  actionHref,
  actionLabel,
  children,
  className = "",
  id,
}: Props) {
  return (
    <section id={id} className={`space-y-4 ${className}`.trim()}>
      <SectionHeader
        icon={icon}
        title={title}
        subtitle={subtitle}
        actionHref={actionHref}
        actionLabel={actionLabel}
      />
      {children}
    </section>
  );
}
