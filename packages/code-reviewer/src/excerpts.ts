import type { IdentifiedFinding } from "./schemas.js";
import type { DiffScopedRead, DiffScopedReadRequest } from "./source-provider.js";

// The excerpt planner of the verification pass (change `finder-verification`,
// Phase 1 §2): findings plus file contents in, fenced-block plans out. Pure and
// deterministic — the same findings over the same files always produce
// byte-identical blocks — so the policy can be measured for free (the Phase 3
// backcheck) before any model sees it.
//
// WHY THIS SHAPE. research §7 measured what a verifier needs on #269: a cited
// `file:line` alone serves 1 of 38 findings, because the deciding lines sit in
// the module header (D9, D10, D12, D14), in a caller (D13: the guard that
// refutes a claim about `build_photo` lives in `main`), or in another file. So a
// finding's line is a LOCATOR, never a boundary: the planner always prepends
// the module header (E1), snaps to the enclosing top-level unit (E2), adds one
// hop of same-file callers (E3) and resolves backticked identifiers across the
// diff's other files (E4). E5 — a file-list block for `testing` claims — was
// removed by the owner (plan-review F3): an absence claim cannot be confirmed by
// quoting what is present.
//
// Every limit below is SEALED with the gate (gate.md Pre-registration §1). A
// finding over a limit is `unverifiable`, never truncated: a cut excerpt could
// drop exactly the line that refutes the claim.

export const EXCERPT_LIMITS = {
  /** E1: the module header is lines 1 … min(headerMaxLines, h − 1). */
  headerMaxLines: 40,
  /** E2: an enclosing unit longer than this contributes a window, not its whole body. */
  longUnitLines: 80,
  /** E2: the window around the cited range inside a long unit. */
  longUnitContext: 30,
  /** E2 snapping: backticked identifiers naming a same-file unit, at most this many. */
  snapIdentifiers: 2,
  /** E2 fallback: ±this many lines around the cited range when nothing else applies. */
  fallbackWindow: 25,
  /** A cited span longer than this is treated as file-level (header + snapping). */
  maxCitedSpan: 60,
  /** E3: call sites per enclosing unit, first by line. */
  callerSites: 2,
  /** E3: ±this many lines around each call site, clipped to the caller unit. */
  callerContext: 20,
  /** E4: backticked identifiers naming a unit in another diff file, at most this many. */
  crossFileIdentifiers: 2,
  /** E4: the first this-many lines of each such unit. */
  crossFileLines: 40,
  /** Per finding, after merging: at most this many lines … */
  perFindingLines: 220,
  /** … and at most this many rendered characters. */
  perFindingChars: 16_000,
  /** Per review: all admitted blocks together, rendered. */
  perReviewChars: 60_000,
  /** Per review: findings verified at most; the rest are `review-budget`. */
  maxFindings: 25,
} as const;

export type ExcerptLimits = { readonly [K in keyof typeof EXCERPT_LIMITS]: number };

/** Why code — never the model — marked a finding unverifiable before the verifier ran. */
export type ExcerptUnverifiableReason = "excerpt-over-limit" | "review-budget" | "source-refused" | "no-locator";

export interface ExcerptBlock {
  /** Code-assigned (`B1`, `B2`, …), in render order. */
  blockId: string;
  path: string;
  startLine: number;
  endLine: number;
  /** Rendered lines, `NNNN| text`, with `NNNN>| text` inside a cited range, joined by "\n". */
  text: string;
}

export type FindingExcerpt = { blockIds: string[] } | { unverifiable: ExcerptUnverifiableReason; detail: string };

export interface ExcerptPlan {
  blocks: ExcerptBlock[];
  perFinding: Record<string, FindingExcerpt>;
  telemetry: { blocks: number; lines: number; chars: number };
}

export interface PlanExcerptsInput {
  /** Findings in F-id order — admission to the review budget follows this order. */
  findings: readonly IdentifiedFinding[];
  /** The structured diff-scoped reader; called with whole-file requests only. */
  read: (request: DiffScopedReadRequest) => DiffScopedRead;
  /** The reader's allowlist: the files E4 may look into. */
  diffPaths: readonly string[];
  limits?: ExcerptLimits;
}

/** One top-level code unit, 1-based inclusive lines. */
export interface TopLevelUnit {
  name: string;
  start: number;
  end: number;
}

interface Range {
  start: number;
  end: number;
}

// --- E2: top-level units ---

type Language = "python" | "js" | "none";

const languageOf = (path: string): Language => {
  if (/\.py$/i.test(path)) return "python";
  if (/\.(?:ts|tsx|js|jsx|mjs)$/i.test(path)) return "js";
  return "none";
};

const PY_UNIT = /^(?:async\s+)?def\s+(?<def>[A-Za-z_]\w*)|^class\s+(?<cls>[A-Za-z_]\w*)/;
const JS_FUNCTION = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/;
const JS_CLASS = /^(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/;
// `[export ](const|let) name[: Type] = [async ](…) =>`; the arrow is confirmed
// separately because the parameter list may span lines.
const JS_CONST =
  /^(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(?:async\s+)?(\(|[A-Za-z_$][\w$]*\s*=>)/;
// A unit ends at the first following column-0 closing line: `}`, `};`, `});`.
// `}: Props) {` — the close of a destructured signature — is not one
// (plan-review re-run F2).
const JS_CLOSE = /^\}[)\];]*;?\s*$/;

const count = (text: string, char: string): number => text.split(char).length - 1;

/**
 * Whether a `const`/`let` start line really begins an arrow function: the
 * parameter list opened after `=` must close and be followed by `=>`, on this
 * line or — for a multi-line parameter list — on the line where it closes.
 */
function confirmsArrow(lines: readonly string[], index: number, match: RegExpExecArray): boolean {
  // `x =>`: the single-parameter form was matched together with its arrow.
  if (match[2] !== "(") return true;
  let depth = 0;
  // The pattern is anchored at column 0 and ends on the opening `(`, so the scan
  // starts exactly there.
  for (let j = index; j < lines.length && j < index + 40; j += 1) {
    const text = j === index ? lines[j].slice(match[0].length - 1) : lines[j];
    for (let k = 0; k < text.length; k += 1) {
      if (text[k] === "(") depth += 1;
      else if (text[k] === ")") {
        depth -= 1;
        if (depth === 0) return /^\s*(?::[^=;{]*)?=>/.test(text.slice(k + 1));
      }
    }
  }
  return false;
}

interface JsUnitStart {
  name: string;
  /** A `const`/`let` arrow, whose body may end without a closing line. */
  arrow: boolean;
}

function jsUnitStart(lines: readonly string[], index: number): JsUnitStart | undefined {
  const line = lines[index];
  const fn = JS_FUNCTION.exec(line) ?? JS_CLASS.exec(line);
  if (fn) return { name: fn[1], arrow: false };
  const arrow = JS_CONST.exec(line);
  if (arrow && confirmsArrow(lines, index, arrow)) return { name: arrow[1], arrow: true };
  return undefined;
}

const lastNonBlankBefore = (lines: readonly string[], from: number, before: number): number => {
  for (let j = before - 1; j > from; j -= 1) if (lines[j].trim() !== "") return j;
  return from;
};

// A column-0 line that begins a new top-level statement (`export`, `const`,
// `type`, a call, a decorator). Inside a unit's body such lines are indented.
const JS_STATEMENT = /^[A-Za-z_$@]/;
const isJsComment = (line: string): boolean => /^\s*(?:\/\/|\/\*|\*)/.test(line);

/** The last line before `before` that is neither blank nor a comment; `from` when none. */
const lastCodeBefore = (lines: readonly string[], from: number, before: number): number => {
  for (let j = before - 1; j > from; j -= 1) if (lines[j].trim() !== "" && !isJsComment(lines[j])) return j;
  return from;
};

function jsUnits(lines: readonly string[]): TopLevelUnit[] {
  const units: TopLevelUnit[] = [];
  let i = 0;
  while (i < lines.length) {
    const start = jsUnitStart(lines, i);
    if (start === undefined) {
      i += 1;
      continue;
    }
    const { name } = start;
    // An arrow whose first line opens no block (`=> a + 1`, `=>` then an
    // indented expression, or a multi-line parameter list) may end without a
    // closing line; a block body opened on the first line keeps the `}` rule.
    const expressionArrow = start.arrow && count(lines[i], "{") <= count(lines[i], "}");
    const first = lines[i].trimEnd();
    let end: number | undefined;
    // One-line units: `function f() { return 1; }`, `const f = (a) => a + 1;`.
    if (
      first.includes("{") ? count(first, "{") === count(first, "}") && /\}[)\];]*;?$/.test(first) : first.endsWith(";")
    ) {
      end = i;
    }
    let j = i + 1;
    while (end === undefined && j < lines.length) {
      if (JS_CLOSE.test(lines[j])) end = j;
      else if (jsUnitStart(lines, j) !== undefined) end = lastNonBlankBefore(lines, i, j);
      // An arrow with an expression body and no `;` has no closing line: it
      // ends before the next top-level statement instead of absorbing it
      // (impl-review phase 1 F6).
      else if (expressionArrow && JS_STATEMENT.test(lines[j])) end = lastCodeBefore(lines, i, j);
      else j += 1;
    }
    end ??= lastNonBlankBefore(lines, i, lines.length);
    units.push({ name, start: i + 1, end: end + 1 });
    i = Math.max(end + 1, i + 1);
  }
  return units;
}

// A column-0 line that starts the next Python statement. Comments, blank lines
// and the closing bracket of a multi-line signature are not statements.
const isPyStatement = (line: string): boolean => /^[^\s#)\]}]/.test(line);
const isPyCode = (line: string): boolean => line.trim() !== "" && !/^\s*#/.test(line);

/**
 * For each line, whether it begins inside a triple-quoted string. Such a line
 * is string content even at column 0, so it neither starts a unit nor ends one
 * (impl-review phase 1 F6). A small scanner: comments, one-line strings with
 * backslash escapes, and `"""` / `'''` strings with any prefix.
 */
function pyStringContinuations(lines: readonly string[]): boolean[] {
  const inside: boolean[] = [];
  let open: string | undefined;
  for (const line of lines) {
    inside.push(open !== undefined);
    let k = 0;
    while (k < line.length) {
      if (open !== undefined) {
        if (line[k] === "\\") k += 2;
        else if (line.startsWith(open, k)) {
          k += 3;
          open = undefined;
        } else k += 1;
        continue;
      }
      const char = line[k];
      if (char === "#") break;
      if (char === '"' || char === "'") {
        const triple = char.repeat(3);
        if (line.startsWith(triple, k)) {
          open = triple;
          k += 3;
          continue;
        }
        k += 1;
        while (k < line.length && line[k] !== char) k += line[k] === "\\" ? 2 : 1;
      }
      k += 1;
    }
  }
  return inside;
}

function pythonUnits(lines: readonly string[]): TopLevelUnit[] {
  const units: TopLevelUnit[] = [];
  const inString = pyStringContinuations(lines);
  for (let i = 0; i < lines.length; i += 1) {
    const match = inString[i] ? null : PY_UNIT.exec(lines[i]);
    if (!match) continue;
    let next = i + 1;
    while (next < lines.length && (inString[next] || !isPyStatement(lines[next]))) next += 1;
    let end = next - 1;
    while (end > i && !isPyCode(lines[end])) end -= 1;
    units.push({ name: match.groups?.def ?? match.groups?.cls ?? "", start: i + 1, end: end + 1 });
    i = end;
  }
  return units;
}

/** E2's grammar: the top-level units of one file, by its extension. Other file types have none. */
export function findTopLevelUnits(path: string, lines: readonly string[]): TopLevelUnit[] {
  const language = languageOf(path);
  if (language === "python") return pythonUnits(lines);
  if (language === "js") return jsUnits(lines);
  return [];
}

// --- Identifiers ---

/**
 * Backticked identifiers in a description, in order of appearance, deduped.
 * `main()` names `main`; `img.draft()` names `draft` (the last segment).
 */
export function backtickedIdentifiers(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
    const token = match[1]
      .trim()
      .replace(/\(.*\)$/, "")
      .split(".")
      .at(-1);
    if (token !== undefined && /^[A-Za-z_$][\w$]*$/.test(token)) seen.add(token);
  }
  return [...seen];
}

// --- Ranges and rendering ---

const clip = (range: Range, total: number): Range | undefined => {
  const start = Math.max(1, range.start);
  const end = Math.min(total, range.end);
  return start <= end ? { start, end } : undefined;
};

/** Sorted, with overlapping or adjacent ranges merged. */
const mergeRanges = (ranges: readonly Range[]): Range[] => {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Range[] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last !== undefined && range.start <= last.end + 1) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
};

const inAny = (line: number, ranges: readonly Range[]): boolean =>
  ranges.some((range) => line >= range.start && line <= range.end);

function renderRange(view: FileView, range: Range, cited: readonly Range[]): string {
  const width = String(view.lines.length).length;
  const out: string[] = [];
  for (let n = range.start; n <= range.end; n += 1) {
    out.push(`${String(n).padStart(width)}${inAny(n, cited) ? ">" : ""}| ${view.lines[n - 1]}`);
  }
  return out.join("\n");
}

// --- Files ---

interface FileView {
  lines: string[];
  units: TopLevelUnit[];
}

type FileLoad = { ok: true; view: FileView } | { ok: false; reason: string };

/** Whole-file read; a trailing newline does not count as an extra line. */
function loadFile(read: PlanExcerptsInput["read"], path: string): FileLoad {
  const result = read({ path });
  if (!result.delivered) return { ok: false, reason: result.reason };
  const lines = result.lines.length > 1 && result.lines.at(-1) === "" ? result.lines.slice(0, -1) : result.lines;
  return { ok: true, view: { lines, units: findTopLevelUnits(path, lines) } };
}

// --- Per finding ---

interface FindingRanges {
  /** Ranges by path, in insertion order (the cited file first). */
  byPath: Map<string, Range[]>;
  /** The cited range on the cited file, when the finding has a usable line. */
  cited: Range[];
}

const add = (target: FindingRanges, path: string, range: Range | undefined): void => {
  if (range === undefined) return;
  const list = target.byPath.get(path) ?? [];
  list.push(range);
  target.byPath.set(path, list);
};

function callerRanges(view: FileView, unit: TopLevelUnit, limits: ExcerptLimits): Range[] {
  const call = new RegExp(`\\b${unit.name.replace(/\$/g, "\\$")}\\(`);
  const sites: { line: number; caller: TopLevelUnit }[] = [];
  for (const caller of view.units) {
    if (caller === unit) continue;
    for (let n = caller.start; n <= caller.end; n += 1) {
      if (call.test(view.lines[n - 1])) sites.push({ line: n, caller });
    }
  }
  sites.sort((a, b) => a.line - b.line);
  return sites.slice(0, limits.callerSites).flatMap(({ line, caller }) => [
    {
      start: Math.max(caller.start, line - limits.callerContext),
      end: Math.min(caller.end, line + limits.callerContext),
    },
    { start: caller.start, end: caller.start },
  ]);
}

function planFinding(
  finding: IdentifiedFinding,
  view: FileView,
  otherFile: (identifier: string) => { path: string; unit: TopLevelUnit } | undefined,
  limits: ExcerptLimits,
): FindingRanges | "no-locator" {
  const total = view.lines.length;
  const ranges: FindingRanges = { byPath: new Map(), cited: [] };
  const path = finding.file;

  // E1: the module header.
  const firstUnit = view.units.at(0);
  if (firstUnit === undefined) add(ranges, path, clip({ start: 1, end: limits.headerMaxLines }, total));
  else if (firstUnit.start > 1) {
    add(ranges, path, clip({ start: 1, end: Math.min(limits.headerMaxLines, firstUnit.start - 1) }, total));
  }

  // The cited span; an over-long one is treated as file-level.
  let cited: Range | undefined;
  if (finding.startLine !== undefined) {
    const span = { start: finding.startLine, end: finding.endLine ?? finding.startLine };
    if (span.end - span.start + 1 <= limits.maxCitedSpan) cited = span;
  }

  const identifiers = backtickedIdentifiers(finding.description);
  const sameFile = new Map(view.units.map((unit) => [unit.name, unit]));

  // E2: enclosing units, or identifier snapping, or the fallback window.
  const enclosing: TopLevelUnit[] = [];
  if (cited !== undefined) {
    const span = cited;
    ranges.cited.push(span);
    for (const unit of view.units) {
      if (unit.start > span.end || unit.end < span.start) continue;
      enclosing.push(unit);
      if (unit.end - unit.start + 1 > limits.longUnitLines) {
        add(ranges, path, {
          start: Math.max(unit.start, span.start - limits.longUnitContext),
          end: Math.min(unit.end, span.end + limits.longUnitContext),
        });
        add(ranges, path, { start: unit.start, end: unit.start });
      } else add(ranges, path, { start: unit.start, end: unit.end });
    }
  }
  if (enclosing.length === 0) {
    const snapped = identifiers
      .map((identifier) => sameFile.get(identifier))
      .filter((unit): unit is TopLevelUnit => unit !== undefined)
      .slice(0, limits.snapIdentifiers);
    for (const unit of snapped) {
      enclosing.push(unit);
      add(ranges, path, { start: unit.start, end: unit.end });
    }
    if (snapped.length === 0 && cited !== undefined) {
      add(
        ranges,
        path,
        clip({ start: cited.start - limits.fallbackWindow, end: cited.end + limits.fallbackWindow }, total),
      );
    }
  }

  // E3: one hop of same-file callers.
  for (const unit of enclosing) for (const range of callerRanges(view, unit, limits)) add(ranges, path, range);

  // E4: identifiers naming a unit in another diff file.
  const crossFile = identifiers
    .filter((identifier) => !sameFile.has(identifier))
    .map(otherFile)
    .filter((hit): hit is { path: string; unit: TopLevelUnit } => hit !== undefined)
    .slice(0, limits.crossFileIdentifiers);
  for (const { path: other, unit } of crossFile) {
    add(ranges, other, { start: unit.start, end: Math.min(unit.end, unit.start + limits.crossFileLines - 1) });
  }

  // Clip every same-file range to the file, so an out-of-range line yields nothing.
  const own = (ranges.byPath.get(path) ?? []).map((range) => clip(range, total)).filter((r) => r !== undefined);
  if (own.length === 0) ranges.byPath.delete(path);
  else ranges.byPath.set(path, own);
  if (ranges.byPath.size === 0) return "no-locator";
  return ranges;
}

// --- The planner ---

interface Candidate {
  id: string;
  ranges: Map<string, Range[]>;
  cited: Map<string, Range[]>;
}

function buildBlocks(admitted: readonly Candidate[], views: Map<string, FileView>): Omit<ExcerptBlock, "blockId">[] {
  const byPath = new Map<string, { ranges: Range[]; cited: Range[] }>();
  for (const candidate of admitted) {
    for (const [path, ranges] of candidate.ranges) {
      const entry = byPath.get(path) ?? { ranges: [], cited: [] };
      entry.ranges.push(...ranges);
      entry.cited.push(...(candidate.cited.get(path) ?? []));
      byPath.set(path, entry);
    }
  }
  const blocks: Omit<ExcerptBlock, "blockId">[] = [];
  for (const [path, entry] of byPath) {
    const view = views.get(path);
    if (view === undefined) continue;
    for (const range of mergeRanges(entry.ranges)) {
      blocks.push({ path, startLine: range.start, endLine: range.end, text: renderRange(view, range, entry.cited) });
    }
  }
  return blocks;
}

const renderedChars = (blocks: readonly { text: string }[]): number =>
  blocks.reduce((sum, block) => sum + block.text.length, 0);

/**
 * Plans the code excerpts for one review. Findings are admitted in F-id order;
 * a finding whose own excerpt breaks a per-finding limit, or whose new lines
 * would push the review past its budget, is `unverifiable` with a reason code —
 * never truncated, and never refused by the model.
 */
export function planExcerpts(input: PlanExcerptsInput): ExcerptPlan {
  const limits = input.limits ?? EXCERPT_LIMITS;
  const loads = new Map<string, FileLoad>();
  const load = (path: string): FileLoad => {
    let cached = loads.get(path);
    if (cached === undefined) {
      cached = loadFile(input.read, path);
      loads.set(path, cached);
    }
    return cached;
  };
  const views = new Map<string, FileView>();
  const viewOf = (path: string): FileView | undefined => {
    const loaded = load(path);
    if (!loaded.ok) return undefined;
    views.set(path, loaded.view);
    return loaded.view;
  };

  const perFinding: Record<string, FindingExcerpt> = {};
  const admitted: Candidate[] = [];

  for (const finding of input.findings) {
    // A directory-level claim (`scripts/s17`, typically a `testing` claim about
    // a whole area) has no file to excerpt. It is a locator problem, not a
    // refused read: the policy has no rule for it since E5 was removed.
    const directory = finding.file.replace(/\/+$/, "");
    if (!input.diffPaths.includes(finding.file) && input.diffPaths.some((path) => path.startsWith(`${directory}/`))) {
      perFinding[finding.id] = {
        unverifiable: "no-locator",
        detail: `"${finding.file}" is a directory of the diff, not a file; no excerpt rule covers a directory-level claim`,
      };
      continue;
    }
    const loaded = load(finding.file);
    if (!loaded.ok) {
      perFinding[finding.id] = { unverifiable: "source-refused", detail: loaded.reason };
      continue;
    }
    views.set(finding.file, loaded.view);

    const otherFile = (identifier: string) => {
      for (const path of input.diffPaths) {
        if (path === finding.file || languageOf(path) === "none") continue;
        const unit = viewOf(path)?.units.find((candidate) => candidate.name === identifier);
        if (unit !== undefined) return { path, unit };
      }
      return undefined;
    };

    const planned = planFinding(finding, loaded.view, otherFile, limits);
    if (planned === "no-locator") {
      perFinding[finding.id] = {
        unverifiable: "no-locator",
        detail: "no cited line, no module header and no backticked identifier naming a unit",
      };
      continue;
    }

    const candidate: Candidate = {
      id: finding.id,
      ranges: new Map([...planned.byPath].map(([path, ranges]) => [path, mergeRanges(ranges)])),
      cited: new Map([[finding.file, planned.cited]]),
    };
    // The 25-finding cap comes first: past it, every finding is `review-budget`,
    // whatever its own size (impl-review phase 1 F4).
    if (admitted.length >= limits.maxFindings) {
      perFinding[finding.id] = {
        unverifiable: "review-budget",
        detail: `at most ${String(limits.maxFindings)} findings are verified per review`,
      };
      continue;
    }
    const own = buildBlocks([candidate], views);
    const lines = own.reduce((sum, block) => sum + block.endLine - block.startLine + 1, 0);
    const chars = renderedChars(own);
    if (lines > limits.perFindingLines || chars > limits.perFindingChars) {
      perFinding[finding.id] = {
        unverifiable: "excerpt-over-limit",
        detail: `${String(lines)} lines / ${String(chars)} chars against the per-finding limits of ${String(
          limits.perFindingLines,
        )} lines / ${String(limits.perFindingChars)} chars`,
      };
      continue;
    }
    const total = renderedChars(buildBlocks([...admitted, candidate], views));
    if (total > limits.perReviewChars) {
      perFinding[finding.id] = {
        unverifiable: "review-budget",
        detail: `its excerpt would take the review to ${String(total)} chars against the limit of ${String(
          limits.perReviewChars,
        )}`,
      };
      continue;
    }
    admitted.push(candidate);
  }

  const blocks: ExcerptBlock[] = buildBlocks(admitted, views).map((block, index) => ({
    blockId: `B${String(index + 1)}`,
    ...block,
  }));
  for (const candidate of admitted) {
    perFinding[candidate.id] = {
      blockIds: blocks
        .filter((block) =>
          (candidate.ranges.get(block.path) ?? []).some(
            (range) => range.start <= block.endLine && range.end >= block.startLine,
          ),
        )
        .map((block) => block.blockId),
    };
  }
  return {
    blocks,
    perFinding,
    telemetry: {
      blocks: blocks.length,
      lines: blocks.reduce((sum, block) => sum + block.endLine - block.startLine + 1, 0),
      chars: renderedChars(blocks),
    },
  };
}
