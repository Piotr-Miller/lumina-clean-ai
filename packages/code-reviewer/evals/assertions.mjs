const parseOutput = (output) => (typeof output === "string" ? JSON.parse(output) : output);

// Vocabulary from severitySchema (src/schemas.ts), worst first.
const SEVERITY_ORDER = ["critical", "major", "minor", "nit"];

// Finder-side proxy for "this review would fail the change": at least one
// finding at critical or major severity.
export function reviewMustFail(output) {
  let review;
  try {
    review = parseOutput(output);
  } catch (error) {
    return {
      pass: false,
      score: 0,
      reason: "Reviewer output is not JSON: " + (error instanceof Error ? error.message : String(error)),
    };
  }

  const findings = Array.isArray(review?.findings) ? review.findings : [];
  if (findings.length === 0) {
    return { pass: false, score: 0, reason: "Review contains no findings" };
  }

  const highest = SEVERITY_ORDER.find((severity) => findings.some((finding) => finding?.severity === severity));
  if (highest === undefined) {
    return { pass: false, score: 0, reason: "No finding carries a recognized severity" };
  }

  const pass = highest === "critical" || highest === "major";
  return {
    pass,
    score: pass ? 1 : 0,
    reason: "Highest severity found: " + highest,
  };
}

// Inverse of reviewMustFail, for the defect-free case: a review that
// manufactures a critical or major finding on a clean change is over-reporting,
// which is what the tool-enabled clean case measures. Minor and nit are
// tolerated — a reviewer noting a nit on a healthy diff is not a false alarm.
export function reviewMustPass(output) {
  let review;
  try {
    review = parseOutput(output);
  } catch (error) {
    return {
      pass: false,
      score: 0,
      reason: "Reviewer output is not JSON: " + (error instanceof Error ? error.message : String(error)),
    };
  }

  // A missing findings array is a broken envelope, not a clean review — the
  // drifted bare-ARRAY output glm-4.6 produces under tool-attachment would
  // otherwise be scored as "no false alarms" (see output-repair.ts).
  if (!Array.isArray(review?.findings)) {
    return { pass: false, score: 0, reason: "Review carries no findings array" };
  }

  const falseAlarms = review.findings.filter(
    (finding) => finding?.severity === "critical" || finding?.severity === "major",
  );
  if (falseAlarms.length === 0) {
    return {
      pass: true,
      score: 1,
      reason: "No critical/major findings on a defect-free change (" + String(review.findings.length) + " total)",
    };
  }
  const listed = falseAlarms
    .map((finding) => String(finding.severity) + " on " + String(finding.file ?? "(no file)"))
    .join("; ");
  return {
    pass: false,
    score: 0,
    reason: "Manufactured " + String(falseAlarms.length) + " critical/major finding(s): " + listed,
  };
}

// --- Tool-loop telemetry -----------------------------------------------------
// finder-provider.ts reports per-run tool telemetry through promptfoo provider
// metadata, on the success AND the error path. Reading it from here is what
// keeps the closed review-result schema untouched — nothing new rides on the
// model's own output. promptfoo 0.122 exposes providerResponse.metadata as
// context.metadata.

const asPathList = (value) => (Array.isArray(value) ? value.filter((path) => typeof path === "string") : []);

// Returns {telemetry} or {reason}. Every unreadable shape FAILS CLOSED: a
// broken instrument must never be mistaken for an observed zero-call run.
function readToolTelemetry(context) {
  const metadata = context?.metadata;
  if (metadata === null || typeof metadata !== "object") {
    return { reason: "No provider metadata on this row, so tool usage is unobservable" };
  }
  if (metadata.toolEnabled !== true) {
    return { reason: "Row ran tool-less; this assertion belongs on a case that declares a fixtureRoot" };
  }
  // Integer + non-negative, not merely `typeof === "number"`: NaN, Infinity and
  // a negative count are all broken instruments, and NaN in particular would
  // poison tool_calls' average for the whole model (impl-review-phase-2 F1).
  if (!Number.isInteger(metadata.toolCalls) || metadata.toolCalls < 0) {
    return { reason: "Provider metadata carries no usable toolCalls count: " + String(metadata.toolCalls) };
  }
  return {
    telemetry: {
      toolCalls: metadata.toolCalls,
      requestedPaths: asPathList(metadata.requestedPaths),
      deliveredPaths: asPathList(metadata.deliveredPaths),
      refusedPaths: asPathList(metadata.refusedPaths),
    },
  };
}

const listPaths = (paths) => (paths.length === 0 ? "none" : paths.join(", "));

/**
 * Observational tool-usage metric. `score` is the RAW CALL COUNT, refusals
 * included — not a 0-1 ratio — because promptfoo averages a named metric across
 * rows, so `tool_calls` reads as "average getFileContext invocations per row"
 * for each model. It gates nothing: a model may legitimately answer a small
 * diff without fetching, and `tool_required` is where that becomes a failure.
 */
export function countToolCalls(output, context) {
  const read = readToolTelemetry(context);
  if (read.telemetry === undefined) {
    return { pass: false, score: 0, reason: read.reason };
  }

  const { toolCalls, deliveredPaths, refusedPaths } = read.telemetry;
  return {
    pass: true,
    score: toolCalls,
    reason:
      String(toolCalls) +
      " getFileContext call(s) — delivered: " +
      listPaths(deliveredPaths) +
      "; refused: " +
      listPaths(refusedPaths),
  };
}

/**
 * Gate for a case whose defect is knowable ONLY from outside the hunk: the
 * model must have RECEIVED the out-of-hunk file, not merely asked for it.
 * Invocation alone is not evidence — createDiffScopedSource answers an unlisted
 * path, a containment failure or an unreadable file with a model-facing refusal
 * STRING, so from the model's side a refused call looks like a successful fetch.
 * The path comes from the case's `requiredContextPath` var and must be spelled
 * exactly as the diff's `+++ b/<path>` names it (the allowlist is exact-match).
 */
export function requireToolContext(output, context) {
  const requiredPath = context?.vars?.requiredContextPath;
  if (typeof requiredPath !== "string" || requiredPath.length === 0) {
    return { pass: false, score: 0, reason: "No requiredContextPath configured for this case" };
  }

  const read = readToolTelemetry(context);
  if (read.telemetry === undefined) {
    return { pass: false, score: 0, reason: read.reason };
  }

  const { toolCalls, requestedPaths, deliveredPaths, refusedPaths } = read.telemetry;
  const invoked = toolCalls > 0;
  const delivered = deliveredPaths.includes(requiredPath);
  const refused = refusedPaths.includes(requiredPath);
  const requested = requestedPaths.includes(requiredPath);
  // Delivery counts as evidence only when the rest of the telemetry agrees with
  // it. finder-provider.ts records the request and its outcome in the SAME
  // callback, and a delivery cannot happen without a call — so "delivered, but
  // zero calls" or "delivered, but never requested" means the instrument
  // contradicts itself, and reading the optimistic half would let a broken
  // instrument report adoption (impl-review-phase-2 F1).
  const consistent = invoked && requested;

  const contradiction =
    "Telemetry contradicts itself: " +
    requiredPath +
    " is reported delivered, but the run reports " +
    String(toolCalls) +
    " call(s)" +
    (requested ? "" : " and no request for it");

  const componentResults = [
    {
      pass: invoked,
      score: invoked ? 1 : 0,
      reason: invoked ? "Called getFileContext " + String(toolCalls) + " time(s)" : "Never called getFileContext",
    },
    {
      pass: delivered && consistent,
      score: delivered && consistent ? 1 : 0,
      reason: delivered
        ? consistent
          ? "Received content for " + requiredPath
          : contradiction
        : refused
          ? "Asked for " + requiredPath + " but the source refused it, so no context reached the model"
          : "Never received " + requiredPath + " (requested: " + listPaths(requestedPaths) + ")",
    },
  ];

  // The component split exists to tell "never asked" from "asked and refused"
  // from "the instrument disagrees with itself".
  const pass = delivered && consistent;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? "Out-of-hunk context delivered: " + requiredPath
      : delivered
        ? contradiction
        : "Out-of-hunk context never delivered: " + requiredPath,
    componentResults,
  };
}

// --- Hardening precision -----------------------------------------------------
// What these three grade: the finder asserting that a defence PRESENT in the
// diff is MISSING ("no validation", "not sanitized", "not provided"). Every
// fabricated finding on PR #127 had that shape — one flagged a line two below
// the comment explaining the very defence it called absent. The metrics are
// deliberately narrow: absence claims only, not severity and not category,
// which belong to the deferred calibration layer.

/** Shared JSON gate for the three graders below, so each stays readable. */
function readReview(output) {
  try {
    return { review: parseOutput(output) };
  } catch (error) {
    return { reason: "Reviewer output is not JSON: " + (error instanceof Error ? error.message : String(error)) };
  }
}

/**
 * The ONLY fields these graders read. `evidence` is excluded on purpose: from
 * Phase 3 it carries a verbatim source quote, so a grader searching the whole
 * finding would match the quoted defence and score a fabrication as a correct
 * report (plan review F2 — the reason scoreIssueRecall is not reused here).
 * `summary` is excluded because a per-finding verdict needs a per-finding
 * subject.
 */
const findingProse = (finding) =>
  [finding?.description, finding?.suggestion].filter((part) => typeof part === "string" && part.length > 0).join("\n");

function compilePatterns(patterns) {
  const list = Array.isArray(patterns) ? patterns : [];
  if (list.length === 0) return { reason: "no patterns" };
  try {
    return { compiled: list.map((pattern) => new RegExp(String(pattern), "iu")) };
  } catch {
    return { reason: "invalid pattern" };
  }
}

// Negation cues, kept as a source string so every call compiles a FRESH regex —
// a shared /g/ regex carries lastIndex between calls and would skip matches.
// Absence detection is TEMPLATE-based, not cue-based, because a negation near a
// defence says nothing about what the negation attaches to. Reviewers routinely
// use negative wording to APPROVE a defence — "no path traversal is possible
// because parseObjectKey rejects dot segments" — and a nearby-cue heuristic
// scores every one of those as a fabrication (Phase 1 manual review, 1.14).
//
// So a negation only counts when it attaches to a MECHANISM: the thing a defence
// IS. "no traversal check exists" claims an absence; "no traversal is possible"
// asserts the opposite. The templates below encode that direction.

// The nouns a defence is. Deliberately excludes attack nouns (traversal,
// injection, XSS): those are what a defence PREVENTS, and negating them is
// approval.
const MECHANISM =
  "(?:validat\\w*|sanitiz\\w*|sanitis\\w*|escap\\w*|encod\\w*|check\\w*|guard\\w*|limit\\w*|bound\\w*|cap|caps|capping" +
  "|filter\\w*|verif\\w*|enforc\\w*|protection|rejection|restrict\\w*|constraint\\w*|allow-?list\\w*|white-?list\\w*" +
  // Path defences get described in these terms as often as in "validation"
  // terms, and a missed fabrication biases the baseline DOWN — which is the
  // direction that could wrongly trip Phase 2's does-not-reproduce gate.
  "|normaliz\\w*|normalis\\w*|canonicaliz\\w*|canonicalis\\w*|scrub\\w*|gating|gate|gates|deny-?list\\w*|block-?list\\w*)";

// Past participles of applying a defence, for "is/are not <participle>".
const APPLIED =
  "(?:validated|sanitized|sanitised|checked|escaped|encoded|bounded|limited|capped|filtered|verified|enforced|guarded" +
  "|rejected|restricted|applied|present|provided|implemented|used|called|performed" +
  // "the pattern is not anchored" was a silent miss: `anchor` is a defence topic
  // but its participle was absent here (self-test E1).
  "|anchored|allowlisted|whitelisted|constrained" +
  "|normalized|normalised|canonicalized|canonicalised|scrubbed|gated)";

// Bare verb stems, for "fails to <verb>" and "does not <verb>".
const DEFEND =
  "(?:validat|sanitiz|sanitis|escap|encod|check|bound|limit|cap|filter|verif|enforc|guard|reject|restrict" +
  "|normaliz|normalis|canonicaliz|canonicalis|scrub)\\w*";

// What a defence PREVENTS. Used only by the permissive template — "allows path
// Privative adjectives — an absence claim carrying no separate negation word,
// e.g. "the key length is unbounded". Guarded against double negation below.
const PRIVATIVE =
  "\\bun(?:validated|sanitized|sanitised|checked|escaped|encoded|bounded|limited|filtered|verified|guarded|restricted)\\b";

// A HIGH-PRECISION FLOOR, not a complete detector.
//
// This matcher was the fabrication gate for six review rounds and never
// converged: each round fixed the named cases and broke adjacent ones, and the
// last round's own fixes produced five new defect classes (sentence-initial
// capitals, backticks between verb and identifier, a determiner read as a
// pronoun, non-transitive inheritance, and a filler still crossing
// conjunctions). The `llm-rubric` on the same case is now the gate; this is a
// deterministic cross-check.
//
// That changes the design target. A floor must never cry fabrication on a clean
// review; missing one is acceptable and expected, because the rubric carries
// recall. So every template whose failures were being chased is GONE:
//
//   - omission verbs (omits/skips/bypasses) — needed an object slot, and the
//     case-sensitive identifier variant broke on capitals and backticks;
//   - the missing-state subject template — its filler crossed conjunctions at
//     every width tried;
//   - the permissive family (allows/permits/enables) — reversible by words after
//     the match, which cost 11 of 14 adversarial probes in one round;
//   - pronoun-clause inheritance — matched determiners, and only ever existed to
//     serve the identifier templates now dropped.
//
// What remains names its own mechanism, so it cannot borrow a subject from
// surrounding text. `documented misses` in promptfooconfig.test.ts pins what this
// deliberately no longer catches, so the scope is explicit rather than accidental.
const ABSENCE_TEMPLATES = [
  // "no validation", "missing traversal check", "without sanitization"
  {
    kind: "mechanism",
    regex: new RegExp("\\b(?:no|missing|absent|without|lacks?|lacking)\\s+(?:\\w+[\\s-]){0,2}" + MECHANISM + "\\b", "giu"),
  },
  // "is not validated", "was never checked", "isn't checked", "is not provided"
  {
    kind: "mechanism",
    regex: new RegExp("\\b(?:is|are|was|were)(?:\\s+(?:not|never)|n't)\\s+(?:\\w+\\s+){0,2}" + APPLIED + "\\b", "giu"),
  },
  // "fails to sanitize", "neglects to check" — this family genuinely takes "to".
  {
    kind: "mechanism",
    regex: new RegExp("\\b(?:fails?|failed|neglects?|neglected|forgets?|forgot)\\s+to\\s+(?:\\w+\\s+){0,2}" + DEFEND, "giu"),
  },
  // "does not validate", "doesn't check" — a DIRECT negated verb, no "to". These
  // were previously folded into the "fails to" family above, so the matcher only
  // recognised the ungrammatical "does not TO validate" and missed every natural
  // form (Phase 1 re-review, 1.14).
  {
    kind: "mechanism",
    regex: new RegExp("\\b(?:does|do|did)(?:\\s+not|n't)\\s+(?:\\w+\\s+){0,2}" + DEFEND, "giu"),
  },
  // "there is no way to reject traversal", "no logic to validate the key" — the
  // mechanism is named by a VERB here, so the noun templates above miss it.
  {
    kind: "mechanism",
    regex: new RegExp(
      "\\b(?:no|without)\\s+(?:\\w+\\s+){0,2}(?:way|ways|means|mechanism|logic|code|step|steps|attempt|handling)\\s+to\\s+(?:\\w+\\s+){0,2}" +
        DEFEND,
      "giu",
    ),
  },
  { kind: "privative", regex: new RegExp(PRIVATIVE, "giu") },
];

// The permissive family and its three guards (post-verbal negation, approving
// complements, test context) were removed with it. Every one of them existed to
// stop that family inverting, and the family cost 11 of 14 adversarial probes in
// a single round. Recall for "allows path traversal" now belongs to the rubric.

// "not unbounded" / "isn't unvalidated" APPROVE the defence, and so does "does
// not allow arbitrary characters". Without this the privative and permissive
// templates invert the very sentences they were added to catch. `cannot` is
// listed separately because \bnot\b cannot match inside it.
const DOUBLE_NEGATION = /(?:\b(?:not|never|nor)|n't|\bcannot)\s+$/iu;

// A blocked head noun inside the filler means the negation attaches to something
// other than the defence: "no need to sanitize further", "no documentation of
// the validation". "no test covering X" already fails the templates, because
// "test" is not a mechanism.
const NEUTRALIZED_HEAD =
  /\b(?:need|needs|reason|reasons|point|harm|issue|issues|problem|problems|concern|concerns|change|changes|test|tests|testing|coverage|spec|specs|assertion|assertions|documentation|docs|comment|comments)\b/iu;

// The reversing noun can also come AFTER the mechanism: "no validation problem"
// and "no sanitization issue" are approvals, but template 1 stops matching at
// the mechanism, so the head-noun check above never sees the word that flips the
// meaning. Only a defect noun counts here — "no validation of the key" must stay
// a fabrication.
const NEUTRALIZED_TAIL =
  /^\s*(?:problem|problems|issue|issues|concern|concerns|gap|gaps|risk|risks|bug|bugs|defect|defects|error|errors|weakness|weaknesses)\b/iu;

// A negation anywhere in a long finding is not evidence that it attaches to the
// defence. Requiring proximity is what separates "no validation of the key"
// from "the key is validated; there is no test for the reject path".
const NEGATION_WINDOW = 80;

const matchSpans = (text, pattern) => {
  const scanner = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  const spans = [];
  let match;
  while ((match = scanner.exec(text)) !== null) {
    spans.push({ start: match.index, end: match.index + match[0].length });
    if (match[0].length === 0) scanner.lastIndex += 1;
  }
  return spans;
};

/**
 * Splits a finding into CLAUSES, the unit a claim actually lives in.
 *
 * Character proximity is not attachment: within an 80-character window,
 * "Object key handling is correct; this helper omits telemetry on success" linked
 * a defence in one clause to an omission in the next and scored a fabrication
 * (Phase 1 re-verification round 3). A clause boundary is the fix.
 *
 * The sentence break requires a lowercase letter or `)` before the period and a
 * capital after it, so a quoted `../.` or a decimal is never split.
 */
const CLAUSE_BREAK =
  /;|\n|\s+[—–]\s+|,\s+(?:while|whereas|but|although|though|however|yet)\b|(?<=[a-z)])\.\s+(?=[A-Z])/gu;

// Pronoun-clause inheritance was removed with the identifier templates it served.
// It matched `this helper` — a determiner plus noun, not a pronoun — and so
// re-created the very cross-clause false positive the clause split had just
// fixed. It was also non-transitive, losing the subject across two hops.
const splitClauses = (text) =>
  text.split(CLAUSE_BREAK).filter((clause) => typeof clause === "string" && clause.trim().length > 0);

/** Spans within ONE clause where it asserts a mechanism is absent. */
const absenceSpans = (clause) => {
  const spans = [];
  for (const { regex } of ABSENCE_TEMPLATES) {
    for (const span of matchSpans(clause, regex)) {
      const matched = clause.slice(span.start, span.end);
      if (NEUTRALIZED_HEAD.test(matched)) continue;
      if (NEUTRALIZED_TAIL.test(clause.slice(span.end, span.end + 24))) continue;
      if (DOUBLE_NEGATION.test(clause.slice(Math.max(0, span.start - 12), span.start))) continue;
      spans.push(span);
    }
  }
  return spans;
};

const isNear = (a, b) => a.start - b.end <= NEGATION_WINDOW && b.start - a.end <= NEGATION_WINDOW;

const oneLine = (text, limit = 160) => {
  const flat = text.replace(/\s+/gu, " ").trim();
  return flat.length <= limit ? flat : flat.slice(0, limit) + "…";
};

/**
 * Fabrication gate for a diff whose defences are present and commented.
 *
 * `score` is BINARY PER RUN — 1 when no finding claims a declared defence is
 * missing, 0 otherwise — because the pre-registered bar counts RUNS out of 20.
 * A finding-weighted ratio would score one fabricated claim as 0 in a
 * one-finding review and 0.9 in a ten-finding review while the bar counts both
 * as one failed run (plan review F5). Findings are deduplicated for the same
 * reason: one finding matching three defences is one fabricating finding.
 *
 * Reads the case's `presentDefences` var: [{ label, patterns[] }].
 */
export function noFabricatedAbsence(output, context) {
  const read = readReview(output);
  if (read.review === undefined) return { pass: false, score: 0, reason: read.reason };
  const review = read.review;

  const defences = context?.vars?.presentDefences;
  if (!Array.isArray(defences) || defences.length === 0) {
    return { pass: false, score: 0, reason: "No presentDefences configured for this case" };
  }

  // Fails closed, like reviewMustPass: a broken envelope is not a clean run.
  if (!Array.isArray(review?.findings)) {
    return { pass: false, score: 0, reason: "Review carries no findings array" };
  }
  const total = review.findings.length;
  if (total === 0) {
    return { pass: true, score: 1, reason: "No findings, so nothing claims a present defence is missing" };
  }

  const offenders = new Map();
  const componentResults = [];
  let brokenPatterns = 0;

  for (const defence of defences) {
    const label = String(defence?.label ?? "(unlabelled)");
    const compiled = compilePatterns(defence?.patterns);
    if (compiled.compiled === undefined) {
      brokenPatterns += 1;
      componentResults.push({ pass: false, score: 0, reason: compiled.reason + " for " + label });
      continue;
    }

    const claimedBy = [];
    review.findings.forEach((finding, index) => {
      const prose = findingProse(finding);
      if (prose.length === 0) return;
      // The defence and the absence claim must sit in the SAME clause. Proximity
      // survives only as a secondary constraint inside it.
      const claimed = splitClauses(prose).some((clause) => {
        const absences = absenceSpans(clause);
        if (absences.length === 0) return false;
        return compiled.compiled.some((pattern) =>
          matchSpans(clause, pattern).some((span) => absences.some((absence) => isNear(span, absence))),
        );
      });
      if (!claimed) return;
      claimedBy.push(index);
      const entry = offenders.get(index) ?? { labels: new Set(), prose };
      entry.labels.add(label);
      offenders.set(index, entry);
    });

    componentResults.push({
      pass: claimedBy.length === 0,
      score: claimedBy.length === 0 ? 1 : 0,
      reason:
        claimedBy.length === 0
          ? "Not claimed missing: " + label
          : "Claimed missing by finding(s) " + claimedBy.join(", ") + ": " + label,
    });
  }

  // A defence whose patterns did not compile was never graded, so a clean
  // result here would be a broken instrument reading as a clean run.
  if (brokenPatterns > 0) {
    return {
      pass: false,
      score: 0,
      reason: String(brokenPatterns) + " of " + String(defences.length) + " defence(s) have unusable patterns",
      componentResults,
    };
  }

  const fabricating = [...offenders.keys()];
  if (fabricating.length === 0) {
    return {
      pass: true,
      score: 1,
      reason: "No finding claims a present defence is missing (" + String(total) + " finding(s) graded)",
      componentResults,
    };
  }

  const detail = fabricating
    .map((index) => {
      const entry = offenders.get(index);
      return "#" + String(index) + " [" + [...entry.labels].join(", ") + '] "' + oneLine(entry.prose) + '"';
    })
    .join("; ");
  return {
    pass: false,
    score: 0,
    reason:
      String(fabricating.length) +
      " of " +
      String(total) +
      " finding(s) claim a present defence is missing: " +
      detail,
    componentResults,
  };
}

/**
 * Over-suppression guard for the paired vulnerable fixture: the planted defect
 * must be REPORTED, not merely quoted.
 *
 * Deliberately not scoreIssueRecall, which regex-tests JSON.stringify(review) —
 * once findings carry an `evidence` quote of the vulnerable line, that search
 * matches the quote and passes while the finding text says nothing about the
 * vulnerability (plan review F2). This grader reads findingProse only, and
 * requires the SAME finding to carry critical or major severity, so a defect
 * mentioned in passing as a nit does not clear the guard.
 *
 * Reads the case's `expectedDefect` var: { label, patterns[] }.
 */
export function requireDefectReported(output, context) {
  const read = readReview(output);
  if (read.review === undefined) return { pass: false, score: 0, reason: read.reason };
  const review = read.review;

  const defect = context?.vars?.expectedDefect;
  if (defect === null || typeof defect !== "object" || Array.isArray(defect)) {
    return { pass: false, score: 0, reason: "No expectedDefect configured for this case" };
  }
  const label = String(defect.label ?? "(unlabelled)");
  const compiled = compilePatterns(defect.patterns);
  if (compiled.compiled === undefined) {
    return { pass: false, score: 0, reason: compiled.reason + " for " + label };
  }

  if (!Array.isArray(review?.findings)) {
    return { pass: false, score: 0, reason: "Review carries no findings array" };
  }

  const matching = review.findings.filter((finding) =>
    compiled.compiled.some((pattern) => pattern.test(findingProse(finding))),
  );
  if (matching.length === 0) {
    return {
      pass: false,
      score: 0,
      reason:
        "No finding reports " +
        label +
        " in its description or suggestion (" +
        String(review.findings.length) +
        " finding(s); evidence and summary are not searched)",
    };
  }

  const escalated = matching.filter((finding) => finding?.severity === "critical" || finding?.severity === "major");
  if (escalated.length === 0) {
    const severities = matching.map((finding) => String(finding?.severity)).join(", ");
    return {
      pass: false,
      score: 0,
      reason: "Reported " + label + " only below major severity: " + severities,
    };
  }

  return {
    pass: true,
    score: 1,
    reason: "Reported " + label + " at " + String(escalated[0].severity) + " severity",
  };
}

const collapse = (text) => text.replace(/\s+/gu, " ").trim();

// Diff headers first, THEN marker stripping: "--- a/x" and "+++ b/x" both start
// with a marker character and would otherwise survive as content.
const canonicalDiffBody = (diff) =>
  collapse(
    diff
      .split(/\r?\n/u)
      .filter((line) => !/^(?:diff --git |index |--- |\+\+\+ |@@)/u.test(line))
      .map((line) => line.replace(/^[+\- ]/u, ""))
      .join("\n"),
  );

const canonicalQuote = (text) =>
  collapse(
    text
      .split(/\r?\n/u)
      .map((line) => line.replace(/^\s*[+\-]\s?/u, ""))
      .join("\n"),
  );

/**
 * Observational quote-fidelity metric. Gates nothing; the number is the point.
 *
 * The schema can only require `evidence` to be non-empty — it cannot prove the
 * string is a real quote (plan review F4), and enforcing that in a superRefine
 * would reject a whole review over one bad quote. So fidelity is MEASURED here:
 * the share of offered evidence strings that appear verbatim in the diff after
 * canonicalization (diff markers stripped, whitespace collapsed).
 *
 * The denominator is evidence OFFERED, not findings, and a run with no evidence
 * at all scores 1 as "not applicable". That keeps pre-intervention baseline rows
 * — where the field does not exist yet — from dragging the average, and makes
 * the metric read as "of the quotes offered, how many are real".
 */
export function scoreEvidenceFidelity(output, context) {
  const read = readReview(output);
  if (read.review === undefined) return { pass: false, score: 0, reason: read.reason };
  const review = read.review;

  const diff = context?.vars?.diff;
  if (typeof diff !== "string" || diff.length === 0) {
    return { pass: false, score: 0, reason: "No diff var on this row, so quotes are unverifiable" };
  }
  if (!Array.isArray(review?.findings)) {
    return { pass: false, score: 0, reason: "Review carries no findings array" };
  }

  const offered = review.findings
    .map((finding, index) => ({ index, evidence: typeof finding?.evidence === "string" ? finding.evidence.trim() : "" }))
    .filter((entry) => entry.evidence.length > 0);

  if (offered.length === 0) {
    return {
      pass: true,
      score: 1,
      reason:
        "Not applicable: no finding carries an evidence field (" + String(review.findings.length) + " finding(s))",
    };
  }

  const body = canonicalDiffBody(diff);
  const invented = offered.filter((entry) => !body.includes(canonicalQuote(entry.evidence)));
  const score = (offered.length - invented.length) / offered.length;

  return {
    pass: true,
    score,
    reason:
      String(offered.length - invented.length) +
      " of " +
      String(offered.length) +
      " evidence string(s) quote the diff verbatim" +
      (invented.length === 0
        ? ""
        : " — not found: " + invented.map((entry) => '#' + String(entry.index) + ' "' + oneLine(entry.evidence, 80) + '"').join("; ")),
  };
}

export function scoreIssueRecall(output, context) {
  let review;
  try {
    review = parseOutput(output);
  } catch (error) {
    return {
      pass: false,
      score: 0,
      reason: "Reviewer output is not JSON: " + (error instanceof Error ? error.message : String(error)),
    };
  }

  const expectedIssues = context.vars.expectedIssues;
  if (!Array.isArray(expectedIssues) || expectedIssues.length === 0) {
    return { pass: false, score: 0, reason: "No expected issues configured" };
  }

  const searchable = JSON.stringify(review).toLowerCase();
  const componentResults = expectedIssues.map((issue) => {
    const patterns = Array.isArray(issue.patterns) ? issue.patterns : [];
    let compiledPatterns;
    try {
      compiledPatterns = patterns.map((pattern) => new RegExp(String(pattern), "iu"));
    } catch {
      return {
        pass: false,
        score: 0,
        reason: "invalid pattern for " + String(issue.label),
      };
    }
    const matched = compiledPatterns.some((pattern) => pattern.test(searchable));
    return {
      pass: matched,
      score: matched ? 1 : 0,
      reason: (matched ? "Found: " : "Missing: ") + String(issue.label),
    };
  });
  const hits = componentResults.filter((result) => result.pass).length;
  const score = hits / componentResults.length;
  // Integer hit-count is authoritative for pass/fail: a rounded ratio threshold
  // (score >= 0.67) would silently demand 3-of-3, because 2/3 = 0.666...
  const requiredHits = Math.ceil((componentResults.length * 2) / 3);

  return {
    pass: hits >= requiredHits,
    score,
    reason:
      "Found " +
      String(hits) +
      " of " +
      String(componentResults.length) +
      " expected issues (need " +
      String(requiredHits) +
      ")",
    componentResults,
  };
}
