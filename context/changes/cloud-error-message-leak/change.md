---
change_id: cloud-error-message-leak
title: "Raw internal error text reaches the user instead of copy they can act on"
status: new
created: 2026-09-24
updated: 2026-09-24
archived_at: null
---

## Notes

Reported by the user 2026-09-24, in their words:

> `Signal timed out.` — ten message nie znaczy nic dla usera, trzeba go owrapować w sensowny
> komunikat.

Observed live on production the same day: a Cloud AI submission failed and the enhance page showed
**"Signal timed out."** under the Try again / Start over buttons. That string is **not ours**. It is
the message Deno's `AbortSignal.timeout` produces, surfaced verbatim from inside the Edge Function.

### The instance is not the bug — the default is

The obvious fix is to special-case that one string. That would be wrong, and the investigation says
so. `deriveDisplayError` (`src/components/hooks/cloud-job-decisions.ts:123-133`) decides what the
user reads on a `failed` row:

```
if (errorCode === "provider_rate_limited") return PROVIDER_RATE_LIMITED_MESSAGE;
if (isRgbaAlphaError(errorMessage))        return RGBA_ALPHA_MESSAGE;
return errorMessage ?? GENERIC_FAILED_MESSAGE;
```

**Exactly two failures get copy written for a human. Everything else falls through to the row's raw
`error_message`** — whatever text happened to be caught upstream. The module's own doc comment
records this as intended ("unknown codes/messages fall back to the row's `error_message`"), so it is
a design decision, not an oversight, and this change is a request to reverse it.

The codes that can reach that row, from `supabase/functions/enhance/` and `src/lib/services/`:

| `error_code`            | Friendly copy today?                  |
| ----------------------- | ------------------------------------- |
| `provider_rate_limited` | yes — mapped by code                  |
| _(RGBA signature)_      | yes — sniffed out of the message text |
| `start_failed`          | **no** — this is the reported case    |
| `internal_error`        | **no**                                |
| `callback_failed`       | **no**                                |
| `replicate_failed`      | **no**                                |
| `timeout`               | only by accident — see below          |
| `canceled`              | only by accident — see below          |

### The accident worth naming

`timeout` and `canceled` look handled, but they are not handled **here**. They read well only because
our own handlers write friendly text into `error_message` when they fail the row
(`timeout.handler.ts:92` writes `STRINGS.cloudErrors.timeout`; the cancel handler writes
`STRINGS.cloudErrors.canceled`). So **who wrote the row decides what the user reads.** When the writer
is our code, the copy is fine; when it is a caught exception, an internal string ships to production.
That is the actual defect, and it is why the fix belongs in the display layer rather than in each
writer.

`STRINGS.cloudErrors` already carries `genericFailed`, so the vocabulary for a safe default exists
and is unused on this path.

### What this change is for

Invert the default: map `error_code` to copy, and fall back to the **generic** message rather than to
raw text. The raw string stays where it is useful — the job row keeps it, and Sentry already receives
it — so nothing is lost for debugging.

### A second, much worse instance — same day, same code path

Retrying produced this, verbatim, on the enhance page:

```
Replicate predictions.create failed (502): <!DOCTYPE html> <!--[if lt IE 7]> <html class="no-js ie6
oldie" lang="en-US"> <![endif]--> <!--[if IE 7]> <html class="no-js ie7 oldie" lang="en-US"> …
```

**An HTML error page rendered as user-facing copy.** It is built at
`supabase/functions/enhance/index.ts:357-360`, which appends the response body to the thrown message,
and Replicate's 502 is served by Cloudflare as a full HTML document. `classifyStartFailure` maps any
non-429 to `start_failed` (`src/lib/services/replicate-webhook.ts:203-205`), so both observed
failures land on the one code that has no copy, and `deriveDisplayError` passes the text straight
through.

Two things this instance adds that the first did not:

1. **The leak carries an upstream response body**, not just an internal string. What a third party
   puts in an error body is not something this UI should be rendering.
2. **The only thing bounding it is `MAX_ERROR_DETAIL_CHARS = 300`, and that constant lives in
   `supabase/functions/enhance/sentry-scrub.ts`.** It exists to bound what reaches **Sentry**. The
   user-facing surface inherits a diagnostics limit by accident — which is the same defect one level
   down: nothing in this path is deciding what a person should read.

### Deliberately open

Whether each code deserves its own sentence or several collapse into one. `start_failed` in
particular is worth its own: the measured case (`0b8bf6c1`, 2026-09-24) never reached Replicate, cost
nothing and consumed no cap slot, so "please try again" is genuinely the right advice — which the
user could not know from "Signal timed out."

### Not in scope

Changing when a job fails, the Edge Function's 30 s `AbortSignal.timeout` on prediction-create, or
the retry policy. Those are a separate question, noted while diagnosing this one: the same 30 s
constant bounds both prediction-create and output-fetch although they scale with different things.
