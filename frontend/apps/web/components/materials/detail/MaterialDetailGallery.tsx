"use client";

import { useCallback, useRef } from "react";
import { IconChevronLeft } from "../../ui/icons";

type GalleryImage = {
  image_url: string;
  alt_text?: string | null;
  isCover: boolean;
};

type Props = {
  title: string;
  coverGradient: string;
  activeImageUrl: string | null;
  fallbackCoverUrl?: string;
  images: GalleryImage[];
  onSelectImage: (url: string) => void;
  onPreview: () => void;
};

export function MaterialDetailGallery({
  title,
  coverGradient,
  activeImageUrl,
  fallbackCoverUrl,
  images,
  onSelectImage,
  onPreview,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollThumbs = useCallback((direction: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: direction === "left" ? -180 : 180, behavior: "smooth" });
  }, []);

  const heroSrc = activeImageUrl || fallbackCoverUrl;

  return (
    <div>
      <button
        type="button"
        onClick={onPreview}
        className={`group relative h-[min(52vh,280px)] w-full overflow-hidden rounded-ds-card border border-ds-border bg-ds-surface shadow-ds-card transition-shadow hover:shadow-ds-card-hover sm:h-[340px] lg:h-[420px] xl:h-[440px] ${coverGradient}`}
        aria-label="預覽教材主圖"
      >
        {heroSrc ? (
          <img src={heroSrc} alt={title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
        ) : (
          <span className="flex h-full items-center justify-center text-ds-textSubtle">尚無封面圖</span>
        )}
      </button>

      {images.length > 0 ? (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => scrollThumbs("left")}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-ds-border bg-ds-surface text-ds-textMuted transition-colors hover:border-ds-borderStrong hover:text-ds-heading focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
            aria-label="上一張縮圖"
          >
            <IconChevronLeft className="size-4" />
          </button>
          <div ref={scrollRef} className="flex flex-1 snap-x snap-mandatory gap-2 overflow-x-auto pb-1">
            {images.map((img, idx) => {
              const isActive = heroSrc === img.image_url;
              return (
                <button
                  key={`${img.image_url}-${idx}`}
                  type="button"
                  onClick={() => onSelectImage(img.image_url)}
                  className={`shrink-0 snap-start overflow-hidden rounded-xl border-2 bg-ds-surface transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus ${
                    isActive ? "border-edu-primary ring-2 ring-edu-primary/20" : "border-ds-border hover:border-ds-borderStrong"
                  }`}
                  aria-label={img.isCover ? "切換封面圖" : `切換細節照片 ${idx}`}
                  aria-current={isActive ? "true" : undefined}
                >
                  <img
                    src={img.image_url}
                    alt={img.alt_text || (img.isCover ? `${title} 封面` : `${title} 細節 ${idx}`)}
                    className="h-14 w-[4.5rem] object-cover sm:h-16 sm:w-20"
                    loading="lazy"
                  />
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => scrollThumbs("right")}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-ds-border bg-ds-surface text-ds-textMuted transition-colors hover:border-ds-borderStrong hover:text-ds-heading focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
            aria-label="下一張縮圖"
          >
            <IconChevronLeft className="size-4 rotate-180" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
