import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const swipeThreshold = 48;

export default function BusImageGalleryModal({
  open,
  images = [],
  startIndex = 0,
  onClose,
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef(0);
  const touchCurrentX = useRef(0);

  useEffect(() => {
    if (!open) return;
    const safeIndex = Number.isFinite(Number(startIndex)) ? Math.max(0, Math.min(images.length - 1, Number(startIndex))) : 0;
    setActiveIndex(safeIndex);
  }, [open, startIndex, images.length]);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
        return;
      }
      if (event.key === "ArrowLeft") {
        setActiveIndex((prev) => (prev - 1 + images.length) % images.length);
      }
      if (event.key === "ArrowRight") {
        setActiveIndex((prev) => (prev + 1) % images.length);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, images.length, onClose]);

  if (!open || images.length === 0) return null;

  const activeImage = images[activeIndex] || images[0];

  const showPrevious = () => {
    setActiveIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const showNext = () => {
    setActiveIndex((prev) => (prev + 1) % images.length);
  };

  const onTouchStart = (event) => {
    touchStartX.current = event.touches[0]?.clientX || 0;
    touchCurrentX.current = touchStartX.current;
  };

  const onTouchMove = (event) => {
    touchCurrentX.current = event.touches[0]?.clientX || touchCurrentX.current;
  };

  const onTouchEnd = () => {
    const delta = touchCurrentX.current - touchStartX.current;
    if (Math.abs(delta) < swipeThreshold) return;
    if (delta > 0) showPrevious();
    else showNext();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close gallery"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-slate-900/70 text-white transition hover:scale-105 hover:bg-slate-900"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="mx-auto flex h-full w-full max-w-5xl items-center justify-center">
        <div className="w-full overflow-hidden rounded-2xl border border-white/15 bg-slate-900/90 shadow-2xl">
          <div
            className="relative aspect-video w-full overflow-hidden bg-slate-950"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <img
              src={activeImage.src}
              alt={activeImage.alt || activeImage.label || "Bus gallery image"}
              className="h-full w-full object-cover transition duration-300"
            />

            {images.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={showPrevious}
                  className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/30 bg-slate-900/60 text-white transition hover:bg-slate-900"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>

                <button
                  type="button"
                  onClick={showNext}
                  className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/30 bg-slate-900/60 text-white transition hover:bg-slate-900"
                  aria-label="Next image"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            ) : null}

            <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-slate-950/95 via-slate-950/50 to-transparent px-5 pb-4 pt-10 text-white">
              <p className="text-sm font-semibold">{activeImage.label || "Image"}</p>
              {activeImage.description ? <p className="mt-1 text-xs text-slate-200">{activeImage.description}</p> : null}
            </div>
          </div>

          {images.length > 1 ? (
            <div className="flex items-center justify-center gap-2 border-t border-white/10 bg-slate-900 px-4 py-3">
              {images.map((image, index) => {
                const active = index === activeIndex;
                return (
                  <button
                    key={`gallery-dot-${image.label || index}`}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className={`h-2.5 rounded-full transition ${
                      active ? "w-8 bg-[rgb(var(--seat-primary))]" : "w-2.5 bg-slate-500 hover:bg-slate-400"
                    }`}
                    aria-label={`Go to image ${index + 1}`}
                  />
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
