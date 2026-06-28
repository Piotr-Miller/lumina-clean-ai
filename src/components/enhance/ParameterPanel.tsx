import { RotateCcw, Sparkles, Wand2 } from "lucide-react";
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

/** Friendly labels per parameter key. */
const PARAM_LABELS: Record<string, string> = {
  gamma: "Brightness (gamma)",
  blur: "Smoothing (blur)",
  strength: "Denoise strength",
};

const SECONDARY_BUTTON = "border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white";

/**
 * Renders the active engine's parameter sliders with their values, an Auto
 * on/off toggle, a Recalculate action, per-slider "adjusted" marking, and a
 * Restore Auto control. Pure presentation — every recompute/threading decision
 * lives in `EnhanceWorkspace`; this component only emits callbacks.
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
    <div className="flex flex-col gap-5 rounded-xl border border-white/15 bg-white/5 p-5 text-white">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Adjustments</h3>
        <Button
          type="button"
          size="sm"
          variant={auto.on ? "default" : "ghost"}
          aria-pressed={auto.on}
          onClick={auto.onToggle}
          className={cn("gap-1.5", !auto.on && "text-white/70 hover:bg-white/10 hover:text-white")}
        >
          <Wand2 className="size-4" />
          Auto {auto.on ? "on" : "off"}
        </Button>
      </div>

      {keys.map((key) => {
        const range = ranges[key];
        const value = values[key];
        const isOverridden = overridden.has(key);
        return (
          <div key={key} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <label htmlFor={`param-${key}`} className="font-medium text-white/80">
                {PARAM_LABELS[key] ?? key}
                {isOverridden && <span className="ml-1.5 text-white/45">· adjusted</span>}
              </label>
              <span className="text-white/60 tabular-nums">{formatParamValue(value, range.step)}</span>
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
            />
          </div>
        );
      })}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={auto.onRecalculate}
          disabled={!auto.on}
          className={cn("gap-1.5", SECONDARY_BUTTON)}
        >
          <Sparkles className="size-4" />
          Recalculate
        </Button>
        {hasOverrides && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRestoreAuto}
            className={cn("gap-1.5", SECONDARY_BUTTON)}
          >
            <RotateCcw className="size-4" />
            Restore Auto
          </Button>
        )}
      </div>

      {engine === "cloud" && provisional && (
        <p className="text-xs text-white/45">
          Provisional — Cloud Auto values are conservative estimates and may be refined.
        </p>
      )}
    </div>
  );
}
