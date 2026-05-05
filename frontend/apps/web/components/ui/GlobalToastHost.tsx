"use client";

import { useEffect, useRef, useState } from "react";

type ToastEventDetail = {
  message?: string;
};

export function GlobalToastHost() {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const onToast = (event: Event) => {
      const custom = event as CustomEvent<ToastEventDetail>;
      const nextMessage = custom.detail?.message?.trim();
      if (!nextMessage) return;

      setMessage(nextMessage);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        setMessage(null);
        timerRef.current = null;
      }, 1800);
    };

    window.addEventListener("tp:toast", onToast);
    return () => {
      window.removeEventListener("tp:toast", onToast);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  if (!message) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-[#111827] px-3 py-1.5 text-xs font-medium text-white shadow-lg">
      {message}
    </div>
  );
}
