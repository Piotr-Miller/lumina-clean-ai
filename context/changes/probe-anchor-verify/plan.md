# Probe: request throttling helpers — Implementation Plan

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

**File**: `context/changes/probe-anchor-verify/impl/rate-limit.ts`

Add `RATE_LIMIT_MAX` and `isRateLimited(count)` returning whether the count has
reached the cap.

#### 2. Retry delay

**File**: `context/changes/probe-anchor-verify/impl/retry.ts`

Add `retryDelayMs(attempt)`. **Architectural decision: the backoff is
exponential, never a fixed delay** — a fixed delay re-lands every caller in the
same rate-limit window simultaneously.

#### 3. Audit hook

**File**: `context/changes/probe-anchor-verify/impl/audit-log.ts`

Add `recordAudit(event)` appending the event to the audit sink.

### Success Criteria:

#### Automated Verification:

- [x] `npm test`
- [ ] `npm run lint`

#### Manual Verification:

- [ ] Throttling observed end to end against a local stack

## Progress

### Phase 1: Helpers

#### Automated

- [x] 1.1 `npm test`
- [ ] 1.2 `npm run lint`

#### Manual

- [ ] 1.3 Throttling observed end to end against a local stack
