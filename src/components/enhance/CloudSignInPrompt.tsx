import { LogIn } from "lucide-react";
import { STRINGS } from "@/lib/enhance-strings";
import { Button } from "@/components/ui/button";

/**
 * Inline gate shown when an anonymous visitor selects the Cloud AI engine.
 * Prompts sign-in instead of silently denying (FR-007). The loaded photo
 * stays in memory — no redirect — so the visitor can sign in (in another tab)
 * and come back, or just switch back to Local.
 */
export function CloudSignInPrompt() {
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-xl bg-(--lc-step-1) px-6 py-8 text-center">
      <LogIn className="size-7 text-[#8f7bf0]" />
      <h3 className="font-lc-display text-lg font-extrabold tracking-tight text-(--lc-ink)">
        {STRINGS.signInPrompt.heading}
      </h3>
      <p className="max-w-sm text-sm text-(--lc-dim)">{STRINGS.signInPrompt.body}</p>
      <div className="mt-1 flex flex-wrap justify-center gap-3">
        <Button asChild variant="beam">
          <a href="/auth/signin">{STRINGS.signInPrompt.signIn}</a>
        </Button>
        <Button asChild variant="lcsecondary">
          <a href="/auth/signup">{STRINGS.signInPrompt.createAccount}</a>
        </Button>
      </div>
    </div>
  );
}
