# temp_steps.md — immediate next steps

> Written 2026-09-24, just before a laptop restart. **Short-lived by design**: this is the
> next-few-actions list. `temp_queue.md` holds the wider backlog; `context/foundation/roadmap.md`
> stays authoritative for what the project is building. Delete this file once the list is empty.

## Where things stand

Everything is merged and deployed. **Zero open PRs.** Master carries the S-18 work, the corrected
S-17 evidence, `test-photos/`, the two production diagnostics under `scripts/`, and both changes
opened today.

**Run A did not happen.** It was attempted twice on 2026-09-24 and blocked by a **Replicate outage**
(Cloudflare's status page listed Replicate as `Degraded`). Both attempts failed at
`predictions.create`, never reached the model, and therefore **cost nothing and consumed no cap
slot** — all three daily slots are still available. Full record:
`context/changes/cloud-quality-below-local/defaults-experiment.md` § Attempt log.

## One thing that will NOT survive a fresh clone

`context/changes/finder-serialization-outage/change.md` is **untracked**. It exists only on this
laptop's working tree. It is a well-formed registration for the `ai-review` finder outage (15
consecutive `AI_NoObjectGeneratedError` failures since 2026-09-20, zero successes), and it is not in
git, so another machine does not have it.

⚠️ It was also reformatted by a repo-wide `prettier --write context/` on 2026-09-24. Markdown
formatting only, no content change, and it would have to pass `format:check` before committing
anyway — but it was edited without asking, so check it reads as intended before committing.

## Steps

1. **Re-run Run A when Replicate is Operational.** Check the status page first. Nothing about the
   setup changed: input `test-photos/licensed/01-aurora-fjord-kirkjufell.jpg`, Auto **off**, gamma
   `1.00`, strength `0.05`. The persisted row from the failed attempt already proved those values
   reach the backend, so that half needs no re-verification. Retrying during the outage buys
   nothing — `predictions.create` already retries three times internally, so each click is nine
   attempts.

2. **After a successful run**, pull the raw bytes and hand them over for measurement:

   ```
   SUPABASE_SERVICE_ROLE_KEY='<key>' python3 scripts/prod-fetch-results.py <8-char-job-id>
   ```

   Judge the **raw stored `result.png`**, never the in-app AFTER pane, which is post-passed. The
   comparison baseline is `190832de`: 56.2 % green against 43.2 % magenta.

3. **Decide whether to commit `finder-serialization-outage`.** Registering it means a roadmap entry,
   a GitHub issue and a `github-issues.md` row — the same treatment S-18 got. Leaving it untracked
   means it does not exist anywhere else.

4. **Decide whether to plan `cloud-error-message-leak`.** The framing is already written into its
   `change.md`, so it can go straight to `/rune-plan`. The fix is small: invert the default in
   `deriveDisplayError` so an unknown `error_code` falls back to the generic message instead of the
   row's raw `error_message`, and map the codes that have no copy — `start_failed`,
   `internal_error`, `callback_failed`, `replicate_failed`. Most of the wording already exists in
   `STRINGS.cloudErrors`.

5. **Refresh `temp_queue.md` when convenient.** Its option C ("swap the ai-review finder model") is
   stale: it says the evidence is one day thin, and it is now 15 consecutive failures over five days
   with a concrete routing hypothesis recorded in `finder-serialization-outage`.
