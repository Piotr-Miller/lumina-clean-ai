import { STRINGS } from "@/lib/enhance-strings";
import type { EngineId } from "@/lib/engines/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EngineToggleProps {
  engine: EngineId;
  onChange: (engine: EngineId) => void;
  disabled?: boolean;
}

/**
 * Always-visible Local / Cloud AI engine selector. Rendered above the
 * workspace so the Cloud option is on screen even before a photo is loaded
 * (the sign-up funnel; FR-006/FR-007). Selecting an engine only switches which
 * action UI shows — it never discards the loaded photo.
 */
export function EngineToggle({ engine, onChange, disabled = false }: EngineToggleProps) {
  return (
    <div
      role="group"
      aria-label={STRINGS.engine.groupLabel}
      className="mx-auto mb-6 inline-flex gap-0.5 rounded-[10px] bg-(--lc-step-2) p-[3px]"
    >
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-pressed={engine === "local"}
        disabled={disabled}
        onClick={() => {
          onChange("local");
        }}
        className={cn(
          "rounded-lg px-5 hover:bg-(--lc-step-3) hover:text-(--lc-ink)",
          engine === "local" ? "bg-[#26262e] text-(--lc-ink)" : "text-(--lc-dim)",
        )}
      >
        {STRINGS.engine.local}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-pressed={engine === "cloud"}
        disabled={disabled}
        onClick={() => {
          onChange("cloud");
        }}
        className={cn(
          "rounded-lg px-5 hover:bg-(--lc-step-3) hover:text-(--lc-ink)",
          engine === "cloud" ? "bg-[#26262e] text-(--lc-ink)" : "text-(--lc-dim)",
        )}
      >
        {STRINGS.engine.cloud}
      </Button>
    </div>
  );
}
