"use client";

import type { LucideIcon } from "lucide-react";
import { CheckCircle2, CircleX, Clock3, Download, Landmark, Lock, Upload } from "lucide-react";

export type TimelineTone = "completed" | "processing" | "failed" | "locked";
export type TimelineIconKey = "orderCreated" | "transferCompleted" | "proofUploaded" | "reviewing" | "downloadReady" | "proofRejected" | "locked";

export type TimelineItem = {
  label: string;
  helper?: string;
  tone: TimelineTone;
  icon?: TimelineIconKey;
};

function iconByKey(key: TimelineIconKey): LucideIcon {
  if (key === "orderCreated") return CheckCircle2;
  if (key === "transferCompleted") return Landmark;
  if (key === "proofUploaded") return Upload;
  if (key === "reviewing") return Clock3;
  if (key === "downloadReady") return Download;
  if (key === "proofRejected") return CircleX;
  return Lock;
}

function iconByTone(tone: TimelineTone): LucideIcon {
  if (tone === "completed") return CheckCircle2;
  if (tone === "processing") return Clock3;
  if (tone === "failed") return CircleX;
  return Lock;
}

function classByTone(tone: TimelineTone): string {
  if (tone === "completed") return "border-emerald-200 bg-emerald-50 text-[#16A34A]";
  if (tone === "processing") return "border-violet-200 bg-violet-50 text-[#7C3AED]";
  if (tone === "failed") return "border-rose-200 bg-rose-50 text-[#DC2626]";
  return "border-gray-200 bg-gray-50 text-[#9CA3AF]";
}

export function OrderStatusTimeline({
  title = "訂單進度",
  items,
  className = "",
}: {
  title?: string;
  items: TimelineItem[];
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-[#ececf2] bg-white p-5 shadow-[0_4px_12px_rgba(0,0,0,0.04)] ${className}`}>
      <p className="text-base font-semibold tracking-tight text-[#1F2937]">{title}</p>
      <ul className="mt-4 space-y-3.5">
        {items.map((item, idx) => {
          const Icon = item.icon ? iconByKey(item.icon) : iconByTone(item.tone);
          return (
            <li key={`${item.label}-${idx}`} className="relative flex gap-3 rounded-xl border border-[#ececf2] bg-white p-3.5 transition-opacity duration-300">
              {idx < items.length - 1 ? <span className="absolute left-[27px] top-[40px] h-[calc(100%-14px)] w-px bg-[#E5E7EB]" /> : null}
              <span className={`relative z-[1] mt-0.5 inline-flex size-8 items-center justify-center rounded-full border ${classByTone(item.tone)}`}>
                <Icon className="size-4" strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-5 text-[#1F2937]">{item.label}</p>
                {item.helper ? <p className="mt-1 text-xs leading-5 text-[#6B7280]">{item.helper}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
