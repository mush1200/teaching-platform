type Props = {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  disabled?: boolean;
};

export function PaginationBar({ page, totalPages, onPrev, onNext, disabled }: Props) {
  return (
    <nav
      className="flex flex-wrap items-center justify-center gap-3 py-4"
      aria-label="分頁"
    >
      <button
        type="button"
        disabled={disabled || page <= 1}
        onClick={onPrev}
        className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-[#1F2937] shadow-sm transition hover:bg-[#F9FAFB] disabled:cursor-not-allowed disabled:opacity-40"
      >
        上一頁
      </button>
      <span className="text-sm font-medium text-[#6B7280]">
        第 <span className="font-bold text-[#1F2937]">{page}</span> / {totalPages} 頁
      </span>
      <button
        type="button"
        disabled={disabled || page >= totalPages}
        onClick={onNext}
        className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-[#1F2937] shadow-sm transition hover:bg-[#F9FAFB] disabled:cursor-not-allowed disabled:opacity-40"
      >
        下一頁
      </button>
    </nav>
  );
}
