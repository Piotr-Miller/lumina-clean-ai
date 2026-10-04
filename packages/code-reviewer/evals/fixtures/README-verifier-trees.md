# Verifier-only fixture trees

Two source trees that feed **only the verifier's reader** in change `finder-verification`
(`context/changes/finder-verification/plan.md`, Phase 0 §2; plan-review F1). The finder never sees them: the
promptfoo row var that points at them, `verifierRoot`, never reaches `createReviewer`, so the JS-loop and React
rows stay tool-less and their finder requests stay byte-identical to the archived rows.

They exist because R4 requires the fixture metrics to be computed on **published** findings, and a finding is
published only after a verifier has quoted code from a source root. These two rows had no root (only
`cross-hunk` and `clean-change` carry a `fixtureRoot`).

Frozen in the Phase 0 freeze commit, **before any verifier prompt existed**. Do not edit them: each hash below
is also recorded in `context/changes/finder-verification/gate.md` § Inputs freeze.

| File                                              | Source                                                        | Lines | sha256                                                             |
| ------------------------------------------------- | ------------------------------------------------------------- | ----- | ------------------------------------------------------------------ |
| `js-loop/src/users.js`                            | post-image of the inline diff, `promptfooconfig.yaml:101–118` | 9     | `5e6d2a1976e6a33d5c6b547c9e8da56074eea1e6f1742cbe372baedddb84148a` |
| `react-migration/src/components/MetricsPanel.jsx` | post-image of `react-migration.diff`, plus lines 5–9          | 55    | `7dccd391bdf4546321fcaa11a08d79b37bcabcbcede055eb2add6c83521e1f73` |

## Lines that are not in a diff

- **`users.js`**: none. The diff is one hunk from line 1 that covers the whole 9-line file.
- **`MetricsPanel.jsx` lines 5–9**: the diff carries lines 1–4 (`@@ -1,4 +1,4 @@`) and 10–55
  (`@@ -10,52 +10,46 @@`), so lines 5–9 had to be supplied.
  - **Line 5 is forced**, not authored: the second hunk header names the enclosing function
    `function formatValue(value, unit) {`. That line must come before line 10, and lines 1–4 are fixed by the first
    hunk, so it is line 5.
  - **Lines 6–9 are authored** as the rest of `formatValue`'s body; line 10 reads `rounded`, so line 9 defines it:

    ```js
    function formatValue(value, unit) {
      if (typeof value !== "number" || Number.isNaN(value)) {
        return "—";
      }
      const rounded = Math.round(value * 100) / 100;
    ```

## Neutrality rule

Decided by the owner on 2026-10-04, as a correction made during Phase 0 (`plan.md` Phase 0 §2). The freely
authored lines 6–9 contain no identifier involved in the three planted flaws (line 24, lost cleanup; line 25,
stale closure; line 39, unsafe HTML) and have no bearing on any of them. `MetricsPanel`, the unit that encloses
all three flaws, calls `formatValue` at line 45. That call cannot be avoided, because the hunk header puts
`formatValue` in the file, and it takes no part in any of the flaws.

## Checks

Both checks are run from `packages/code-reviewer/evals`. A non-zero exit fails the freeze.

1. **Post-image.** Every line the diff carries (its `+` and context lines, at their new-side numbers) equals the
   tree's line at that number. The check also compares the identifiers on lines 5–9 with those on lines 24, 25
   and 39, and fails if they share any.

   ```bash
   python3 - <<'EOF'
   import re, sys, yaml
   def post(diff):
       out = {}; n = None
       for l in diff.split("\n"):
           m = re.match(r"@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@", l)
           if m: n = int(m.group(1)); continue
           if n is None or l.startswith("-") or l == "": continue
           out[n] = l[1:]; n += 1
       return out
   cfg = yaml.safe_load(open("promptfooconfig.yaml"))
   js = [t for t in cfg["tests"] if t["description"].startswith("Finds the material defects")][0]["vars"]["diff"]
   cases = [(js, "fixtures/js-loop/src/users.js"),
            (open("fixtures/react-migration.diff").read(), "fixtures/react-migration/src/components/MetricsPanel.jsx")]
   ok = True
   for diff, path in cases:
       tree = open(path).read().split("\n")[:-1]
       p = post(diff); bad = [n for n, l in p.items() if n > len(tree) or tree[n - 1] != l]
       print(path, "diff lines", len(p), "tree lines", len(tree), "mismatches", bad); ok &= not bad
   tree = open(cases[1][1]).read().split("\n")
   ids = lambda s: set(re.findall(r"[A-Za-z_$][\w$]*", s))
   flaw = set().union(*(ids(tree[n - 1]) for n in (24, 25, 39)))
   auth = set().union(*(ids(tree[n - 1]) for n in range(5, 10)))
   print("shared identifiers", sorted(flaw & auth)); ok &= not (flaw & auth)
   sys.exit(0 if ok else 1)
   EOF
   ```

   Result at the freeze: `users.js` 9 of 9 lines, `MetricsPanel.jsx` 50 of 50 diff lines (55 in the tree), no
   mismatches, no shared identifiers.

2. **The plan's `sed` check.** It must print `0`:

   ```bash
   sed -n 5,9p fixtures/react-migration/src/components/MetricsPanel.jsx \
     | grep -cwE 'metricsClient|subscribe|channel|handleMetrics|className|dangerouslySetInnerHTML|__html|description|p|metrics'
   ```

3. **Hashes.** Running `sha256sum` on the two files must reproduce the table above.
