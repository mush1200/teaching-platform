import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  children: ReactNode;
  id?: string;
  action?: ReactNode;
};

export function MaterialDetailSection({ title, description, children, id, action }: Props) {
  return (
    <section id={id} className="border-t border-ds-border px-5 py-6 sm:px-7">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ds-heading">{title}</h2>
          {description ? <p className="mt-1 text-sm text-ds-textMuted">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
