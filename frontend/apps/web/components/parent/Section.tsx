import type { ReactNode } from "react";

type Props = {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
};

export function Section({ title, action, children, className = "", id }: Props) {
  return (
    <section id={id} className={`space-y-4 ${className}`.trim()}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight text-[#1F2937] md:text-xl">{title}</h2>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
