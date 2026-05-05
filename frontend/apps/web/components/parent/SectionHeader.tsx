import Link from "next/link";

type Props = {
  icon?: string;
  title: string;
  subtitle?: string;
  actionHref?: string;
  actionLabel?: string;
};

export function SectionHeader({
  icon,
  title,
  subtitle,
  actionHref = "/explore",
  actionLabel = "查看更多教材 >",
}: Props) {
  return (
    <header className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-col gap-0.5 md:flex-row md:items-baseline md:gap-3">
          <h2 className="flex items-center gap-2 text-[24px] font-extrabold tracking-tight text-[#111827]">
            {icon ? <span className="text-[22px]" aria-hidden>{icon}</span> : null}
            <span>{title}</span>
          </h2>
          {subtitle ? <p className="text-[13px] font-normal text-[#9CA3AF]">{subtitle}</p> : null}
        </div>
      </div>
      <Link href={actionHref} className="shrink-0 text-[14px] font-semibold text-[#6C63FF]/95 transition hover:underline">
        {actionLabel}
      </Link>
    </header>
  );
}
