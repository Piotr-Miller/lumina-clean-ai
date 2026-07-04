import { useRef, useState } from "react";
import { ChevronsLeftRight } from "lucide-react";
import { STRINGS } from "@/lib/enhance-strings";

interface BeforeAfterSliderProps {
  /** Original image (revealed on the left as the divider moves right). */
  beforeSrc: string;
  /** Enhanced result (the base layer, revealed on the right). */
  afterSrc: string;
  /** Intrinsic pixel dimensions (before === after) — used to size the box to
      the image's aspect ratio so the divider tracks the real image width. */
  width: number;
  height: number;
  /** Accessible description of the image subject. */
  alt?: string;
}

const STEP = 2;

/**
 * Custom before/after comparison slider — the drag-reveal "wow" moment
 * (FR-011). The whole region is the slider widget: pointer-draggable and
 * keyboard-operable (arrows/Home/End). Responsive to its container; usable at
 * mobile-portrait width. Reused verbatim by the cloud path (S-03/S-04).
 */
export function BeforeAfterSlider({ beforeSrc, afterSrc, width, height, alt = "" }: BeforeAfterSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const [dragging, setDragging] = useState(false);

  function updateFromClientX(clientX: number) {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, pct)));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowLeft") {
      setPos((p) => Math.max(0, p - STEP));
    } else if (e.key === "ArrowRight") {
      setPos((p) => Math.min(100, p + STEP));
    } else if (e.key === "Home") {
      setPos(0);
    } else if (e.key === "End") {
      setPos(100);
    } else {
      return;
    }
    e.preventDefault();
  }

  return (
    <div
      ref={containerRef}
      role="slider"
      tabIndex={0}
      aria-label={STRINGS.slider.ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pos)}
      className="relative mx-auto w-full touch-none overflow-hidden rounded-xl bg-black/20 select-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:outline-none"
      style={{
        aspectRatio: `${String(width)} / ${String(height)}`,
        maxWidth: `calc(60vh * ${String(width)} / ${String(height)})`,
      }}
      onPointerDown={(e) => {
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
        updateFromClientX(e.clientX);
      }}
      onPointerMove={(e) => {
        if (dragging) updateFromClientX(e.clientX);
      }}
      onPointerUp={(e) => {
        setDragging(false);
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      }}
      onKeyDown={onKeyDown}
    >
      {/* The container owns the box (aspect-ratio sized, capped at 60vh); both
          layers fill it exactly, so the divider tracks the real image width. */}
      <img
        src={afterSrc}
        alt={alt ? STRINGS.slider.enhancedAlt(alt) : STRINGS.slider.enhancedFallback}
        draggable={false}
        className="block h-full w-full object-cover"
      />

      {/* Original, clipped to the left of the divider. */}
      <img
        src={beforeSrc}
        alt={alt ? STRINGS.slider.originalAlt(alt) : STRINGS.slider.originalFallback}
        draggable={false}
        className="absolute inset-0 block h-full w-full object-cover"
        style={{ clipPath: `inset(0 ${String(100 - pos)}% 0 0)` }}
      />

      {/* Divider + visual handle (decorative; the container owns interaction). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white/80"
        style={{ left: `${String(pos)}%` }}
      >
        <div className="absolute top-1/2 left-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg">
          <ChevronsLeftRight className="size-4" />
        </div>
      </div>
    </div>
  );
}
