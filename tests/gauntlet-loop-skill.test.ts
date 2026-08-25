/**
 * Contract test for the repo-owned `gauntlet-loop` skill.
 *
 * WHY THIS EXISTS. `npm run check:skills` proves the two trees are byte-identical
 * and says nothing about what they say; `npm run format:check` does not even read
 * them (`.claude/` and `.agents/` are in `.prettierignore`). So the invariants
 * below — each one load-bearing and each one already broken once during
 * authoring — had no guard at all.
 *
 * This pins CONTRACTS, not prose. Every assertion protects a property that makes
 * the method work: if the blind critic learns which artifact is ours, the loop
 * measures nothing; if the reviewed-package gate drops its `--prefix`, it silently
 * checks the wrong project. Rewording around them is fine. If an edit trips one,
 * decide whether you meant to change the contract — do not delete the assertion
 * to get green.
 *
 * Behavioural properties a file test cannot reach (activation, routing, critic
 * isolation at runtime, stop-condition) live in the skill's own
 * `references/eval-matrix.md` and are run by hand. The staging helper those
 * documents point at is covered separately by `gauntlet-staging.test.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Both published copies must satisfy the contract, not just the one we edit. */
const TREES = [".claude/skills/gauntlet-loop", ".agents/skills/gauntlet-loop"] as const;

const read = (tree: string, file: string): string => readFileSync(join(ROOT, tree, file), "utf8");

/**
 * The rows of the eval matrix's results ledger — the four-row table, not any
 * other table in the file. A recorded run adds per-case result tables that also
 * carry a "control" column, so anchoring on the ledger header is what keeps the
 * assertions below pointed at the gate rather than at a run write-up.
 */
const ledgerRows = (evals: string): string[] => {
  const lines = evals.split("\n");
  const header = lines.findIndex((line) => /^\|\s*run\s*\|\s*date\s*\|\s*harness\s*\|/.test(line));
  expect(header, "results ledger table not found").toBeGreaterThan(-1);

  const rows: string[] = [];
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith("|")) break;
    rows.push(line);
  }
  return rows;
};

/** The fenced block of the blind preference critic's prompt. */
const blindPrompt = (contract: string): string => {
  const start = contract.indexOf("You are comparing two artifacts");
  expect(start, "blind preference critic prompt not found").toBeGreaterThan(-1);
  const end = contract.indexOf("```", start);
  expect(end, "blind prompt block is unterminated").toBeGreaterThan(start);
  return contract.slice(start, end);
};

describe.each(TREES)("gauntlet-loop skill contract (%s)", (tree) => {
  it("keeps the blind critic blind: neutral artifact labels, no side revealed", () => {
    const prompt = blindPrompt(read(tree, "references/critic-contract.md"));

    expect(prompt).toContain("ARTIFACT A:");
    expect(prompt).toContain("ARTIFACT B:");
    // Any of these words in the critic's own prompt tells it which side to favour.
    expect(prompt).not.toMatch(/\bour\b|\bours\b|\bthe bar\b|\breference\b/i);
  });

  it("never puts the A/B mapping on the shared filesystem", () => {
    const contract = read(tree, "references/critic-contract.md");
    const skill = read(tree, "SKILL.md");

    // A subagent shares this filesystem: `..`, rg and Get-ChildItem all work, so
    // a mapping file "in a directory we did not name to the critic" is obscurity,
    // not isolation. The side is recovered by hash AFTER the verdict instead.
    for (const doc of [contract, skill]) {
      expect(doc).not.toMatch(/mapping\/|MAP=|"ours"\s*:/);
      expect(doc).toContain("scripts/gauntlet-stage.ts");
    }
    expect(contract).toMatch(/reveal --round/);
  });

  it("quotes commands that run in this repo's primary shell", () => {
    // PowerShell is primary here and does not take Bash's `\` continuation: it
    // splits the call into two broken commands. A documented command that only
    // runs in one of the two shells is a documented command that fails silently.
    for (const file of [
      "SKILL.md",
      "references/critic-contract.md",
      "references/bars.md",
      "references/guardrails.md",
    ]) {
      expect(read(tree, file), `${file} uses a Bash-only line continuation`).not.toMatch(/\\\r?\n/);
    }
  });

  it("does not promise more tamper-detection than reveal performs", () => {
    const contract = read(tree, "references/critic-contract.md");

    // Reveal compares the staged files against the REFERENCE, so an edit to the
    // ours side alone passes unless the artifact itself is handed in. Claiming
    // "the helper detects tampering" flat out is how that gap gets trusted.
    expect(contract).toMatch(/reveal --round[^\n]*--ours/);
  });

  it("cannot be signed off on a single harness", () => {
    const evals = read(tree, "references/eval-matrix.md");

    // Each harness has exactly one setting that silently defeats critic isolation
    // (a forked critic on Claude Code, a missing `fork_turns: "none"` on Codex),
    // and each is checkable only there. A gate satisfied on one harness therefore
    // never executed the other's check — so the ledger takes four rows, not two.
    expect(evals).toContain('fork_turns: "none"');
    const rows = ledgerRows(evals);
    for (const harness of ["Claude Code", "Codex"]) {
      const forHarness = rows.filter((row) => new RegExp(`\\|\\s*${harness}\\s*\\|`).test(row));
      expect(forHarness, `${harness} needs a with-skill row and a control row`).toHaveLength(2);
    }
  });

  it("asks the control only for the section a control can answer", () => {
    const evals = read(tree, "references/eval-matrix.md");
    const controlRows = ledgerRows(evals).filter((row) => /\|\s*control\s*\|/.test(row));

    expect(controlRows, "one control row per harness").toHaveLength(2);
    // §1, §3, §4 and §5 measure the skill's own contract — activation, staging,
    // stop condition, reference handling. A session without the skill loaded has
    // no contract to keep, so a score in those columns was graded against
    // nothing, and a blank there reads as a gate nobody finished.
    for (const row of controlRows) {
      expect((row.match(/\bn\/a\b/g) ?? []).length, `control row must mark §1/§3/§4/§5 n/a: ${row}`).toBe(4);
    }
  });

  it("states what blinding buys, and admits what it does not", () => {
    const contract = read(tree, "references/critic-contract.md");

    // Claiming stronger blinding than a shared filesystem can deliver is the
    // failure this skill is supposed to prevent, not commit.
    // `\W{0,4}` so markdown emphasis around "not" does not break the assertion.
    expect(contract).toMatch(/not\W{0,4}a sandbox/i);
    expect(contract).toMatch(/incidental/i);
    expect(contract).toMatch(/adversarial/i);
  });

  it("requires a provably clean critic context on every harness", () => {
    const skill = read(tree, "SKILL.md");
    const contract = read(tree, "references/critic-contract.md");

    // Codex's default spawn inherits the whole turn history — the one setting
    // that silently defeats every other rule in the contract.
    for (const doc of [skill, contract]) expect(doc).toContain('fork_turns: "none"');
  });

  it("gates the reviewed package in its own working directory", () => {
    const skill = read(tree, "SKILL.md");

    // Run from the repo root, bare `npm ci && npm run lint` checks the ROOT
    // project; CI gets this right via `working-directory: packages/code-reviewer`.
    expect(skill).toContain("npm --prefix packages/code-reviewer");
    expect(skill).not.toMatch(/npm ci && npm run lint/);
  });

  it("keeps reference bytes out of git and pins them by hash instead", () => {
    const bars = read(tree, "references/bars.md");

    // Public repo: third-party screenshots and users' photos are never committed.
    expect(bars).toContain("scratchpad/gauntlet/");
    expect(bars).toMatch(/sha256/i);
    expect(bars).not.toMatch(/context\/changes\/[^\s]*\/reference/);
  });

  it("routes the lead into bars.md before it answers anything", () => {
    const skill = read(tree, "SKILL.md");
    const beforeStep0 = skill.slice(0, skill.indexOf("## Step 0"));

    // Run 5's failure was not activation: the skill fired, the lead answered from
    // SKILL.md alone, never opened bars.md, and fell back to asking the user to
    // name a reference. The routing imperative has to sit BEFORE Step 0, because
    // by the time Step 0 is read the first response has often been drafted.
    expect(beforeStep0).toMatch(/references\/bars\.md/);
    // `\s+` because prettier rewraps this prose — the rule is the contract, not the line break.
    expect(beforeStep0).toMatch(/before\s+your\s+first\s+response/i);
  });

  it("bans outsourcing the reference search once, above every domain", () => {
    const bars = read(tree, "references/bars.md");
    const crossDomain = bars.slice(bars.indexOf("## How to propose a bar"), bars.indexOf("## Reference material"));

    // The ban lived in Domain A, so it read as a Domain A rule and did not bind
    // Domain D — where the same "name one, or let me pick" fallback came back.
    expect(crossDomain).toMatch(/do not ask the user to name candidates/i);
    expect(crossDomain, "the imperative needs its worked pair, which is the form that binds").toMatch(
      /- Good:[\s\S]*- Bad:/,
    );
    // And it must not be duplicated back into a domain: two copies drift apart.
    const domainA = bars.slice(bars.indexOf("## A."), bars.indexOf("## B."));
    expect(domainA).not.toMatch(/do not ask the user to name candidates/i);
  });

  it("carries named reference defaults in the domains a lead actually lands on", () => {
    const bars = read(tree, "references/bars.md");
    const section = (from: string, to: string): string => bars.slice(bars.indexOf(from), bars.indexOf(to));

    // A category ("comparable products", "better articles") is what made the lead
    // hand the search back to the user. Every prose/visual domain needs candidates
    // concrete enough to propose in a first response.
    for (const [from, to] of [
      ["## A.", "## B."],
      ["## D.", "## E."],
    ]) {
      const domain = section(from, to);
      expect(
        domain.match(/https:\/\//g)?.length ?? 0,
        `${from} needs at least two named defaults`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("refuses to become a CI gate and refuses to touch the archive", () => {
    const skill = read(tree, "SKILL.md");

    // test-plan.md §4 records the team decision: quality judging has no stable
    // oracle and is excluded from the test stack.
    expect(skill).toMatch(/\.github\/workflows\//);
    expect(skill).toMatch(/test-plan\.md`? §4/);
    // Hard rule shared by every skill in this repo, quoted verbatim.
    expect(skill).toContain("This change is archived. Open a new change with `/10x-new` instead.");
  });

  it("resolves every reference file it points at", () => {
    const skill = read(tree, "SKILL.md");
    const referenced = [...skill.matchAll(/`references\/([\w-]+\.md)`/g)].map((m) => m[1]);

    expect(new Set(referenced).size).toBeGreaterThan(0);
    for (const file of new Set(referenced)) {
      expect(() => read(tree, `references/${file}`), `${file} is referenced but missing`).not.toThrow();
    }
  });
});
