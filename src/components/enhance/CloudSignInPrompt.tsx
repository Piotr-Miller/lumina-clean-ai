import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Inline gate shown when an anonymous visitor selects the Cloud AI engine.
 * Prompts sign-in instead of silently denying (FR-007). The loaded photo
 * stays in memory — no redirect — so the visitor can sign in (in another tab)
 * and come back, or just switch back to Local.
 */
export function CloudSignInPrompt() {
  return (
    <div className="flex w-full flex-col items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-6 py-8 text-center">
      <LogIn className="size-7 text-purple-300" />
      <h3 className="text-lg font-semibold text-white">Sign in to use Cloud AI</h3>
      <p className="max-w-sm text-sm text-white/70">
        Cloud AI delivers a noticeably cleaner result than the local engine. Sign in (or create a free account) to
        process this photo in the cloud — your photo stays loaded.
      </p>
      <div className="mt-1 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <a href="/auth/signin">Sign in</a>
        </Button>
        <Button
          asChild
          variant="outline"
          className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
        >
          <a href="/auth/signup">Create account</a>
        </Button>
      </div>
    </div>
  );
}
