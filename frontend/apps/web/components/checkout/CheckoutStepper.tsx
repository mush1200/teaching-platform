type Step = 1 | 2 | 3 | 4;

const STEPS: { step: Step; label: string }[] = [
  { step: 1, label: "確認訂單" },
  { step: 2, label: "建立訂單" },
  { step: 3, label: "上傳憑證" },
  { step: 4, label: "等待審核" },
];

type Props = {
  /** Currently highlighted step (1–4). */
  activeStep: Step;
};

export function CheckoutStepper({ activeStep }: Props) {
  return (
    <nav aria-label="結帳進度" className="w-full">
      <ol className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-3">
        {STEPS.map(({ step, label }) => {
          const done = activeStep > step;
          const current = activeStep === step;
          return (
            <li key={step} className="flex flex-col items-center text-center">
              <span
                className={`flex size-9 items-center justify-center rounded-full text-xs font-bold ${
                  done
                    ? "bg-[#6C63FF] text-white"
                    : current
                      ? "bg-[#FF6B73] text-white shadow-[var(--shadow-button-flow)] ring-4 ring-[#FF6B73]/20"
                      : "border border-[#E5E7EB] bg-white text-[#9CA3AF]"
                }`}
                aria-current={current ? "step" : undefined}
              >
                {done ? "✓" : step}
              </span>
              <span
                className={`mt-2 text-[11px] font-semibold leading-snug sm:text-xs ${
                  current ? "text-[#1F2937]" : done ? "text-[#6C63FF]" : "text-[#9CA3AF]"
                }`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
