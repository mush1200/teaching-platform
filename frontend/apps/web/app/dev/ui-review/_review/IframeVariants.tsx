"use client";

import { useCallback } from "react";

/**
 * UI Review 的「同一條真實路由 × 多個方案 × 多個寬度」預覽（dev-only，由 `/dev/ui-review/*` 頁面使用）。
 *
 * 每個方案只在**預覽 iframe 自己的文件**裡注入 CSS（必要時做一個具名的 DOM 調整），
 * **不改任何 canonical 元件、token 或路由** —— 關掉這一頁，產品就是原樣。
 * iframe 與本頁同源（皆為 UI Review 前端），因此可以直接操作 `contentDocument`。
 *
 * 這裡**不**讀寫 cookie／storage、不發 API：iframe 內的登入狀態就是瀏覽器本來的狀態
 * （要看買家頁面，請先用 UI Review fixture 帳號從 `/login` 正常登入）。
 */

export type Variant = {
  key: string;
  label: string;
  /** 注入到 iframe `<head>` 的 CSS。 */
  css?: string;
};

type Width = { w: number; h: number; scale: number };

function applyVariant(doc: Document, variant: Variant) {
  if (variant.css) {
    const style = doc.createElement("style");
    style.setAttribute("data-ui-review-variant", variant.key);
    style.textContent = variant.css;
    doc.head.appendChild(style);
  }
}

function Frame({ src, variant, width }: { src: string; variant: Variant; width: Width }) {
  const onLoad = useCallback(
    (e: React.SyntheticEvent<HTMLIFrameElement>) => {
      const frame = e.currentTarget;
      const doc = frame.contentDocument;
      if (!doc) return;
      applyVariant(doc, variant);
    },
    [variant]
  );
  return (
    <figure className="m-0">
      <figcaption className="mb-1 text-meta font-semibold text-ds-body">
        {variant.label} · {width.w}px
      </figcaption>
      <div
        className="overflow-hidden rounded-xl border border-black/10 bg-white"
        style={{ width: width.w * width.scale, height: width.h * width.scale }}
      >
        <iframe
          title={`${variant.label} ${width.w}px`}
          src={src}
          loading="lazy"
          onLoad={onLoad}
          style={{ width: width.w, height: width.h, transform: `scale(${width.scale})`, transformOrigin: "0 0", border: 0 }}
        />
      </div>
    </figure>
  );
}

export function IframeVariants({ src, variants, widths }: { src: string; variants: Variant[]; widths: Width[] }) {
  return (
    <div className="space-y-8">
      {widths.map((width) => (
        <section key={width.w}>
          <h3 className="mb-2 text-title text-ds-heading">{width.w}px</h3>
          <div className="flex flex-wrap gap-4">
            {variants.map((v) => (
              <Frame key={`${v.key}-${width.w}`} src={src} variant={v} width={width} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
