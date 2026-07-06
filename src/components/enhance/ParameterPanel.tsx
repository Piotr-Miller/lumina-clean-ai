import { RotateCcw, Sparkles } from "lucide-react";
import { STRINGS } from "@/lib/enhance-strings";
import type { BreadParams, EngineId, LocalParams } from "@/lib/engines/types";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  clampParamValue,
  formatParamValue,
  isBreadParams,
  type ParamKey,
  type ParamRange,
} from "./param-panel-helpers";

interface ParameterPanelProps {
  /** Active engine — selects which parameter set is shown. */
  engine: EngineId;
  /** Current values for the active engine. */
  params: LocalParams | BreadParams;
  /** Per-key ranges for the active engine (a slice of `PARAM_RANGES`). */
  ranges: Record<string, ParamRange>;
  /** Auto-mode controls. */
  auto: { on: boolean; onToggle: () => void; onRecalculate: () => void };
  /** Keys the user has manually overridden (shown as "adjusted"). */
  overridden: ReadonlySet<ParamKey>;
  /** Commit a single slider change (marks the key overridden upstream). */
  onChange: (key: ParamKey, value: number) => void;
  /** Recompute all params from the image and clear overrides. */
  onRestoreAuto: () => void;
}

/** Friendly labels per parameter key (values live in the enhance-strings module). */
const PARAM_LABELS: Record<string, string> = STRINGS.panel.paramLabels;

/** Hairline instrument button — used only inside the panel (kit: Darkroom actions). */
const PANEL_BUTTON =
  "rounded-md border-(--lc-hairline) bg-transparent text-(--lc-ink) shadow-none hover:bg-(--lc-step-2) hover:text-(--lc-ink)";

/**
 * Renders the active engine's parameter sliders with their values, an Auto
 * on/off toggle, a Recalculate action, per-slider "adjusted" marking, and a
 * Restore Auto control. Pure presentation — every recompute/threading decision
 * lives in `EnhanceWorkspace`; this component only emits callbacks.
 *
 * Skin: the kit's "Darkroom instrument" — the one place hairline borders and
 * mono readouts exist (change enhance-ui-refresh; vars in global.css).
 */
export function ParameterPanel({
  engine,
  params,
  ranges,
  auto,
  overridden,
  onChange,
  onRestoreAuto,
}: ParameterPanelProps) {
  const values = params as unknown as Record<string, number>;
  const keys = Object.keys(ranges) as ParamKey[];
  const hasOverrides = overridden.size > 0;
  const provisional = isBreadParams(params) && params.provisional === true;

  return (
    <div className="flex w-full flex-col rounded-[6px] border border-(--lc-hairline) bg-(--lc-step-1) text-(--lc-ink)">
      <div className="flex items-center justify-between gap-2 border-b border-(--lc-hairline) px-4 py-3.5">
        <h3 className="font-lc-display text-sm font-extrabold tracking-tight">{STRINGS.panel.heading}</h3>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-pressed={auto.on}
          onClick={auto.onToggle}
          className={cn(
            "font-lc-mono h-auto rounded border border-(--lc-hairline) px-2 py-1.5 text-[10px] tracking-[0.1em] uppercase",
            auto.on
              ? "bg-(--lc-step-2) text-(--lc-ink) hover:bg-(--lc-step-3) hover:text-(--lc-ink)"
              : "bg-transparent text-(--lc-faint) hover:bg-(--lc-step-2) hover:text-(--lc-dim)",
          )}
        >
          {STRINGS.panel.auto} {auto.on ? STRINGS.panel.autoOn : STRINGS.panel.autoOff}
        </Button>
      </div>

      {keys.map((key) => {
        const range = ranges[key];
        const value = values[key];
        const isOverridden = overridden.has(key);
        return (
          <div key={key} className="flex flex-col gap-2.5 px-4 pt-4">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <label htmlFor={`param-${key}`} className="font-medium text-(--lc-dim)">
                {PARAM_LABELS[key] ?? key}
                {isOverridden && (
                  <span className="font-lc-mono ml-1.5 text-[8.5px] tracking-[0.1em] text-(--lc-faint) uppercase">
                    {STRINGS.panel.adjusted}
                  </span>
                )}
              </label>
              <span className="font-lc-mono rounded border border-(--lc-hairline) bg-(--lc-step-2) px-1.5 py-1 text-[11.5px] text-(--lc-ink) tabular-nums">
                {formatParamValue(value, range.step)}
              </span>
            </div>
            <Slider
              id={`param-${key}`}
              aria-label={PARAM_LABELS[key] ?? key}
              min={range.min}
              max={range.max}
              step={range.step}
              value={[value]}
              onValueChange={(next) => {
                onChange(key, clampParamValue(next[0], range));
              }}
              // Darkroom instrument skin: hairline rail with a brighter filled
              // segment, a rectangular ink thumb, and tick marks along the foot
              // of the control (kit foundations card).
              className="h-5 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.14)_0_1px,transparent_1px_10%)] [background-size:100%_6px] [background-position:0_100%] [background-repeat:no-repeat] [&_[data-slot=slider-range]]:bg-white/70 [&_[data-slot=slider-thumb]]:h-3.5 [&_[data-slot=slider-thumb]]:w-1.5 [&_[data-slot=slider-thumb]]:rounded-[2px] [&_[data-slot=slider-thumb]]:border-0 [&_[data-slot=slider-thumb]]:bg-(--lc-ink) [&_[data-slot=slider-thumb]]:shadow-none [&_[data-slot=slider-track]]:h-0.5 [&_[data-slot=slider-track]]:bg-white/15"
            />
          </div>
        );
      })}

      <div className="flex flex-wrap gap-2 px-4 py-4">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={auto.onRecalculate}
          disabled={!auto.on}
          className={cn("gap-1.5", PANEL_BUTTON)}
        >
          <Sparkles className="size-4" />
          {STRINGS.panel.recalculate}
        </Button>
        {hasOverrides && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRestoreAuto}
            className={cn("gap-1.5", PANEL_BUTTON)}
          >
            <RotateCcw className="size-4" />
            {STRINGS.panel.restoreAuto}
          </Button>
        )}
      </div>

      {engine === "cloud" && provisional && (
        <p className="px-4 pb-3.5 text-xs leading-relaxed text-(--lc-faint)">{STRINGS.panel.provisionalNote}</p>
      )}
    </div>
  );
}
