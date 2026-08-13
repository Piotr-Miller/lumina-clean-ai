// Phase 4 probe — executes the ground truth pre-registered in
// context/changes/impl-review-ci-agent/verification.md.
//
// Run LOCALLY rather than as a PR: review.yml only triggers on PRs targeting
// master, and a master-based PR runs MASTER's reviewer, which has no third pass
// yet. So 4.3-4.7 (behaviour) are testable now; 4.2 (CI run + artifact) is not,
// and is deferred to after the branch merges. The plan and diff below are byte
// -identical in intent to the pre-registered table — nothing was adjusted after
// seeing any result.
import { createImplReviewer } from "../src/impl-reviewer.ts";

const PLAN = `# Probe: request throttling helpers — Implementation Plan

## Overview

Add three small helpers behind the API boundary: a rate-limit check, a retry
delay, and an audit hook.

## What We're NOT Doing

- **No in-memory caching layer.** A cache invalidation story is out of scope for
  this slice; if we need one it gets its own change.
- No distributed rate limiting (single-process counters only).

## Phase 1: Helpers

### Changes Required:

#### 1. Rate-limit check

**File**: \`context/changes/probe-impl-review/impl/rate-limit.ts\`

Add \`RATE_LIMIT_MAX\` and \`isRateLimited(count)\` returning whether the count has
reached the cap.

#### 2. Retry delay

**File**: \`context/changes/probe-impl-review/impl/retry.ts\`

Add \`retryDelayMs(attempt)\`. **Architectural decision: the backoff is
exponential, never a fixed delay** — a fixed delay re-lands every caller in the
same rate-limit window simultaneously.

#### 3. Audit hook

**File**: \`context/changes/probe-impl-review/impl/audit-log.ts\`

Add \`recordAudit(event)\` appending the event to the audit sink.

### Success Criteria:

#### Automated Verification:

- [x] \`npm test\`
- [ ] \`npm run lint\`

#### Manual Verification:

- [ ] Throttling observed end to end against a local stack

## Progress

### Phase 1: Helpers

#### Automated

- [x] 1.1 \`npm test\`
- [ ] 1.2 \`npm run lint\`

#### Manual

- [ ] 1.3 Throttling observed end to end against a local stack
`;

// Injected: MATCH (rate-limit) + DRIFT (retry, fixed delay) + MISSING
// (audit-log absent) + PROHIBITED EXTRA (cache) + BENIGN EXTRA (clamp).
const DIFF = `diff --git a/context/changes/probe-impl-review/impl/rate-limit.ts b/context/changes/probe-impl-review/impl/rate-limit.ts
new file mode 100644
--- /dev/null
+++ b/context/changes/probe-impl-review/impl/rate-limit.ts
@@ -0,0 +1,8 @@
+import { clamp } from "./clamp.js";
+
+export const RATE_LIMIT_MAX = 100;
+
+/** Whether the caller has reached the per-window cap. */
+export function isRateLimited(count: number): boolean {
+  return clamp(count, 0, RATE_LIMIT_MAX) >= RATE_LIMIT_MAX;
+}
diff --git a/context/changes/probe-impl-review/impl/retry.ts b/context/changes/probe-impl-review/impl/retry.ts
new file mode 100644
--- /dev/null
+++ b/context/changes/probe-impl-review/impl/retry.ts
@@ -0,0 +1,5 @@
+/** Delay before the next attempt. */
+export function retryDelayMs(attempt: number): number {
+  void attempt;
+  return 2000;
+}
diff --git a/context/changes/probe-impl-review/impl/cache.ts b/context/changes/probe-impl-review/impl/cache.ts
new file mode 100644
--- /dev/null
+++ b/context/changes/probe-impl-review/impl/cache.ts
@@ -0,0 +1,14 @@
+const store = new Map<string, { value: unknown; expiresAt: number }>();
+
+export function cacheGet(key: string): unknown {
+  const hit = store.get(key);
+  if (hit === undefined || hit.expiresAt < 1) return undefined;
+  return hit.value;
+}
+
+export function cacheSet(key: string, value: unknown, ttlMs: number): void {
+  store.set(key, { value, expiresAt: ttlMs });
+}
diff --git a/context/changes/probe-impl-review/impl/clamp.ts b/context/changes/probe-impl-review/impl/clamp.ts
new file mode 100644
--- /dev/null
+++ b/context/changes/probe-impl-review/impl/clamp.ts
@@ -0,0 +1,3 @@
+export function clamp(value: number, min: number, max: number): number {
+  return Math.min(Math.max(value, min), max);
+}
`;

const steps = [];
const reviewer = createImplReviewer({
  onStepEnd: (step) => {
    const cost = step.providerMetadata?.openrouter?.usage?.cost;
    steps.push({
      inputTokens: step.usage.inputTokens,
      outputTokens: step.usage.outputTokens,
      cost: typeof cost === "number" && Number.isFinite(cost) ? cost : undefined,
    });
  },
});

const result = await reviewer.implReview(
  { plan: PLAN, diff: DIFF, planPath: "context/changes/probe-impl-review/plan.md" },
  { timeoutMs: 300_000 },
);

console.log(JSON.stringify({ model: reviewer.model, grades: result.grades, verdict: result.verdict }, null, 2));
console.log("\nverdictReason:", result.verdictReason);
console.log("\nfindings:");
for (const f of result.findings) {
  console.log(`\n  ${f.id} [${f.severity}/${f.impact}] ${f.dimension} :: ${f.file ?? "(no file)"}`);
  console.log(`    ${f.title}`);
  console.log(`    detail: ${f.detail}`);
}
console.log("\nsteps:", JSON.stringify(steps));
