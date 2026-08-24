// Phase 4 probe — executes the ground truth pre-registered in
// context/changes/impl-review-ci-agent/verification.md.
//
// Originally a local stand-in while review.yml (branches: [master]) could not run
// the pass on an unmerged branch; 4.2 has since passed on PR #128 with this same
// ground truth. It stays because it is the cheapest way to exercise the pass
// against a KNOWN diff — it is how the locus anchoring fix was measured, and how
// the oneOf incompatibility was caught before it shipped.
//
// It is also now the ONLY way to probe the pass end to end: since the cost gate
// shipped (#133), a deliberately-buggy fixture fails the code review on CI and
// the gate then skips the implementation review, so a probe PR measures nothing.
// This harness calls the pass directly and bypasses the gate.
//
// The plan and diff below are byte-identical in intent to the pre-registered
// table; nothing was adjusted after seeing any result.
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

// Capture the raw model text on a schema failure — without it a
// NoObjectGeneratedError tells you only THAT the shape was wrong, never how,
// which is the difference between diagnosing and guessing.
let result;
try {
  result = await reviewer.implReview(
    { plan: PLAN, diff: DIFF, planPath: "context/changes/probe-impl-review/plan.md" },
    { timeoutMs: 300_000 },
  );
} catch (error) {
  const text = error?.text;
  console.log("FAILED:", error?.name, "-", error?.message);
  console.log(`
===== RAW MODEL TEXT (${String(text?.length ?? 0)} chars) =====`);
  console.log(text === undefined ? "(no text)" : text.slice(0, 2500));
  console.log("===== END =====");
  process.exit(1);
}

console.log(JSON.stringify({ model: reviewer.model, grades: result.grades, verdict: result.verdict }, null, 2));
console.log("\nverdictReason:", result.verdictReason);
console.log("\nfindings:");
for (const f of result.findings) {
  const anchor = f.locus === "code" ? `${f.file}:${String(f.startLine)}` : f.locus === "file" ? f.file : "(absent)";
  console.log(`
  ${f.id} [${f.severity}/${f.impact}] ${f.dimension} :: locus=${f.locus} ${anchor}`);
  console.log(`    ${f.title}`);
  console.log(`    detail: ${f.detail}`);
}
console.log("\nsteps:", JSON.stringify(steps));
