import { Cloud, Monitor } from "lucide-react";
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
      className="mx-auto mb-6 inline-flex gap-1 rounded-lg border border-white/15 bg-white/5 p-1"
    >
      <Button
        type="button"
        size="sm"
        variant={engine === "local" ? "default" : "ghost"}
        aria-pressed={engine === "local"}
        disabled={disabled}
        onClick={() => {
          onChange("local");
        }}
        className={cn(engine !== "local" && "text-white/70 hover:bg-white/10 hover:text-white")}
      >
        <Monitor className="size-4" />
        {STRINGS.engine.local}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={engine === "cloud" ? "default" : "ghost"}
        aria-pressed={engine === "cloud"}
        disabled={disabled}
        onClick={() => {
          onChange("cloud");
        }}
        className={cn(engine !== "cloud" && "text-white/70 hover:bg-white/10 hover:text-white")}
      >
        <Cloud className="size-4" />
        {STRINGS.engine.cloud}
      </Button>
    </div>
  );
}
