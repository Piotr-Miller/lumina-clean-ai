---
change_id: finder-provider-routing
title: "Route structured review calls only to schema-enforcing endpoints"
status: archived
archived_at: 2026-08-24T10:20:00Z
created: 2026-08-24
updated: 2026-08-24
---

## Notes

Closes the "pin the finder's production provider" follow-up raised after a live
advisory-review failure on 2026-08-23 (run 32665515420: 55 output tokens →
"No output generated", exit 1).

**Root cause is routing, not the model.** Structured-output support on
OpenRouter is a property of the **endpoint**, not the model id: the same model
is served by several upstreams and only some enforce a strict `json_schema`.
Providers silently ignore parameters they cannot honour, so a strict-schema
request that lands on a non-enforcing endpoint returns free-form text which
fails the parse. Measured twice in this repo:

- the fabrication campaign's Amendment A1 — 4/4 calibration failures under
  unpinned routing, with **three distinct malformed envelopes** plus a timeout;
- the 2026-08-23 live failure above.

`output-repair.ts` and the retry-once policy treat the symptom; this attacks
the cause.

## What changed

`DEFAULT_PROVIDER_ROUTING = { require_parameters: true }` in `config.ts`,
applied to all three structured passes (finder, judge, implementation review).
OpenRouter's own documentation names this as the remedy: _"To ensure requests
route only to endpoints supporting structured outputs, set `require_parameters`
to true."_ It excludes endpoints that cannot honour the request's parameters.

**Deliberately NOT the campaign's pin.** `fabrication-probe.mjs` pins
`{order: ["venice"], allow_fallbacks: false, quantizations: ["fp4"]}` so its
measurements stay comparable within one endpoint. Copying that into production
would trade an occasional malformed envelope for an **outage** whenever that
single upstream is down or rate-limited — a worse failure for a gate that runs
on every PR. Fallbacks stay ON: routing may move freely among endpoints that
_do_ enforce the schema. A test asserts the default carries no `order`,
`allow_fallbacks` or `quantizations`, so the measurement pin cannot drift in.

An explicit `providerRouting` option still wins, so the campaign instrument
keeps measuring what it claims to.

**Escape hatch:** `OPENROUTER_REQUIRE_PARAMETERS=false` restores unfiltered
routing without a release, should the filter ever leave too few endpoints. Only
the exact string `"false"` disables it — a typo keeps the safer default rather
than silently reverting to the failure mode.

## Verification

- New `src/provider-routing.test.ts` — 16 tests: the default on each of the
  three factories, the escape hatch (and that it does not disable an explicit
  pin), the campaign pin still winning, usage accounting preserved, and the
  no-hard-pin guard.
- `npm run typecheck`, `npm run lint`, `npm run test` — **608 passed**.
- One pre-existing assertion narrowed: `impl-reviewer.test.ts` deep-equalled the
  whole settings object while its stated intent was "usage accounting is
  enabled". It now asserts the `usage` key specifically, preserving that intent
  while allowing the routing key alongside it.

## Not claimed

That this eliminates envelope drift. It removes the routing path that _causes_
the known instances; a model can still emit a malformed envelope on an
enforcing endpoint, which is what the repair layer remains for. The real-world
effect is unmeasured — the failure is intermittent, so absence of failures over
the next few runs is not evidence either way.
