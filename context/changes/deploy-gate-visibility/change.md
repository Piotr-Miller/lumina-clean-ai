---
change_id: deploy-gate-visibility
title: A flaky e2e run silently withholds the production deploy
status: new
created: 2026-08-19
updated: 2026-08-19
archived_at: null
---

## Notes

`deploy` is gated `needs: [ci, integration, e2e]` and runs only on push to master. So when `e2e` flakes
on a **master** run, the deploy is **skipped** — and nothing anywhere says so. The merge reports as done,
master moves on, and the deployed Worker silently stays one or more commits behind.

Observed 2026-08-19 on run
[`32298488149`](https://github.com/Piotr-Miller/lumina-clean-ai/actions/runs/32298488149): `ci` ✅,
`integration` ✅, `e2e` ❌ (the wrangler ProxyWorker flake), `deploy` **skipped**. Everything merged in
that session sat on master, undeployed, until someone happened to look.

### Why this is its own change and not part of the flake fix

It is a **policy** question that outlives any particular flake:

- Fixing the wrangler flake (`e2e-webserver-boot-flake`) removes today's trigger. It does not make a
  skipped deploy visible, and the next `e2e` failure — flake or real — reproduces this exactly.
- The gate itself may well be correct. A browser gate that catches a broken north-star flow arguably
  _should_ stop a deploy. The defect is the **silence**, not necessarily the gate.

So conflating the two would fix the trigger and leave the class.

### What is actually wrong

1. **No signal.** A skipped `deploy` produces no annotation, no comment, no notification. `deploy:
skipping` in the checks list is indistinguishable from the PR-run case where skipping is correct and
   expected.
2. **Silent drift.** There is no check anywhere that the deployed Worker matches master's HEAD, so the
   gap can persist unnoticed across several merges.
3. **Same trap as `lessons.md`'s silent-degradation rule** — a best-effort leg that degrades quietly is
   indistinguishable from a working one. This is that pattern at the CI layer.

### Candidate directions, none chosen

- Annotate loudly when `deploy` is skipped on a **master** push (`::error::` or a job summary line),
  while staying silent on PR runs where skipping is the normal path.
- A scheduled or post-merge check comparing the deployed Worker's version metadata against master HEAD,
  surfacing drift rather than trusting the gate.
- Reconsider whether `e2e` should gate `deploy` at all, versus gating on `ci` + `integration` and
  treating `e2e` as blocking for **merge** (it is now a required check under branch protection) but not
  for **deploy**. Note this is a real trade: it would let a genuinely broken browser flow reach prod.

### Do NOT

- **Do not simply remove `e2e` from `deploy.needs`** as a reflex. That converts "deploy silently skipped"
  into "broken flow silently deployed", which is worse.
- **Do not fix this by making the flake rarer.** That is `e2e-webserver-boot-flake`'s job, and a rarer
  flake still hides deploys when it fires.
