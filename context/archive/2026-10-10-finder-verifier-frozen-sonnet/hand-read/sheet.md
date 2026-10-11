# Blinded hand-read — code-refutable refutations

Grade each entry `pass`, `off-target` or `no-evidence` in `grades.json` (`{"R01": "pass", …}`).

**Rule (pre-registered):** Sukces wymaga refuted, cytatu przechodzącego zapieczętowany quote check oraz argumentu, który wraz z cytatem rzeczywiście obala zamrożoną tezę. Hand-read stosuje wcześniej zapisane uzasadnienia. Nietrafiony argument i brak poprawnego cytatu są raportowane osobno.

## R01

**Frozen claim:** After a non-OK create response, setting `process.exitCode` and returning only exits `runPrediction`'s `if` block; execution continues to parse the error body as a prediction and poll using its missing ID. A failed create can therefore spin through polling instead of terminating promptly.

**Pre-registered rationale:** `return` at line 120 leaves `runPrediction` itself (a `return` inside an `if` returns from the enclosing function), so nothing parses the error body or polls; `main`'s `finally` runs the cleanup and the process ends with exit code 1 (the predecessor rejected the "fragile" version of this claim, N45).

**Quote check (automatic):** passed

**Quote:**

```text
process.exitCode = 1;
    return;
```

**Verifier's reason:** The return statement exits the entire runPrediction async function (not just the if block), so execution does not continue to parse the error body as a prediction or proceed to polling.

## R02

**Frozen claim:** For an explicitly requested tuning photo with no runs, `outputs` and `sizes` are empty and `min(sizes, ...)` raises `ValueError`. With no requested IDs, an entirely empty scan instead creates an empty index without explaining that no runs were found.

**Pre-registered rationale:** A requested id with no runs exits with "no runs found for …" before `build_photo` is called, so `min(sizes)` never sees an empty set; an empty default scan writes the index and prints "0 photo(s), 0 run(s)" to stderr.

**Quote check (automatic):** passed

**Quote:**

```text
missing = [i for i in ids if i not in runs]
    if missing:
        sys.exit(f"error: no runs found for {', '.join(missing)} in {', '.join(map(str, args.runs))}")
```

**Verifier's reason:** The code excerpt shows that `missing` is checked and the script exits with an error before `build_photo` is called, so an explicitly requested tuning photo with no runs cannot reach the `min(sizes, ...)` call with empty `sizes`.

## R03

**Frozen claim:** After a non-OK create response, setting `process.exitCode` and returning only exits `runPrediction`'s `if` block; execution continues to parse the error body as a prediction and poll using its missing ID. A failed create can therefore spin through polling instead of terminating promptly.

**Pre-registered rationale:** `return` at line 120 leaves `runPrediction` itself (a `return` inside an `if` returns from the enclosing function), so nothing parses the error body or polls; `main`'s `finally` runs the cleanup and the process ends with exit code 1 (the predecessor rejected the "fragile" version of this claim, N45).

**Quote check (automatic):** passed

**Quote:**

```text
if (!createRes.ok) {
    console.error(`create failed: ${createRes.status} ${await createRes.text()}`);
    process.exitCode = 1;
    return;
  }
```

**Verifier's reason:** The return statement exits runPrediction itself (not just an inner if block), and main() does not call anything after runPrediction except the finally cleanup, so execution does not continue to parse the error body as a prediction or poll with a missing ID.

## R04

**Frozen claim:** After a non-OK create response, setting `process.exitCode` and returning only exits `runPrediction`'s `if` block; execution continues to parse the error body as a prediction and poll using its missing ID. A failed create can therefore spin through polling instead of terminating promptly.

**Pre-registered rationale:** `return` at line 120 leaves `runPrediction` itself (a `return` inside an `if` returns from the enclosing function), so nothing parses the error body or polls; `main`'s `finally` runs the cleanup and the process ends with exit code 1 (the predecessor rejected the "fragile" version of this claim, N45).

**Quote check (automatic):** passed

**Quote:**

```text
process.exitCode = 1;
    return;
```

**Verifier's reason:** The return statement exits the entire runPrediction async function, not just the if block, so execution does not continue to parse the error body as a prediction or poll with a missing ID.

## R05

**Frozen claim:** For an explicitly requested tuning photo with no runs, `outputs` and `sizes` are empty and `min(sizes, ...)` raises `ValueError`. With no requested IDs, an entirely empty scan instead creates an empty index without explaining that no runs were found.

**Pre-registered rationale:** A requested id with no runs exits with "no runs found for …" before `build_photo` is called, so `min(sizes)` never sees an empty set; an empty default scan writes the index and prints "0 photo(s), 0 run(s)" to stderr.

**Quote check (automatic):** passed

**Quote:**

```text
missing = [i for i in ids if i not in runs]
    if missing:
        sys.exit(f"error: no runs found for {', '.join(missing)} in {', '.join(map(str, args.runs))}")
```

**Verifier's reason:** The code checks for ids with no runs and exits with an explicit error before build_photo is ever called, so min(sizes,...) cannot be reached with an empty outputs/sizes for a requested id with no runs; and with no requested IDs, ids = sorted(runs) means only ids that do have runs are built, so an empty scan yields ids=[] and no call to build_photo at all, not a silent empty index for an id with no runs.
