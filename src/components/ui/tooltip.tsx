import * as React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

// House style follows `slider.tsx`: the repo uses the unified `radix-ui`
// package (not per-primitive `@radix-ui/react-*`), with `data-slot` markers.
// Content is re-skinned to the panel's "Darkroom instrument" language (step-2
// surface, hairline border, small text) rather than the default shadcn bubble.

function TooltipProvider({ delayDuration = 200, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delayDuration={delayDuration} {...props} />;
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        collisionPadding={16}
        className={cn(
          "z-50 w-60 max-w-[calc(100vw-2rem)] rounded-md border border-(--lc-hairline) bg-(--lc-step-2) px-3 py-2 text-[11.5px] leading-relaxed text-(--lc-ink) shadow-[0_8px_24px_rgba(0,0,0,0.5)]",
          "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 origin-(--radix-tooltip-content-transform-origin)",
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_1px)] rotate-45 rounded-[2px] border-r border-b border-(--lc-hairline) bg-(--lc-step-2) fill-(--lc-step-2)" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
