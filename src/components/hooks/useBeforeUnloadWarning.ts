import { useEffect } from "react";

/**
 * Warn via the browser's native leave-confirmation while `active` is true —
 * guards in-progress enhance work (a loaded photo or an in-flight cloud job)
 * against an accidental refresh/close that would silently drop it. We don't try
 * to restore state: a `File`/object-URL can't survive a reload, so the prompt
 * IS the fix, not recovery.
 *
 * The listener is attached only while `active`, and removed when it clears or on
 * unmount. Per the HTML spec a prompt requires BOTH `preventDefault()` and a set
 * `returnValue`; modern browsers show their own generic copy (custom text is
 * ignored).
 */
export function useBeforeUnloadWarning(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // `returnValue` is deprecated but still required by some browsers (older
      // Chrome/Firefox, parts of mobile) to actually raise the prompt;
      // `preventDefault()` alone covers current desktop engines.
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
    };
  }, [active]);
}
