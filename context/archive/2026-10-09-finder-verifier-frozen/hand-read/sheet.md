# Blinded hand-read — code-refutable refutations

Grade each entry `pass`, `off-target` or `no-evidence` in `grades.json` (`{"R01": "pass", …}`).

**Rule (pre-registered):** Sukces wymaga refuted, cytatu przechodzącego zapieczętowany quote check oraz argumentu, który wraz z cytatem rzeczywiście obala zamrożoną tezę. Hand-read stosuje wcześniej zapisane uzasadnienia. Nietrafiony argument i brak poprawnego cytatu są raportowane osobno.

## R01

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
  let prediction = (await createRes.json()) as ReplicatePrediction;
```

**Verifier's reason:** The `return` exits `runPrediction`, so the subsequent prediction parsing and polling are not reached after a non-OK response.

## R02

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
  let prediction = (await createRes.json()) as ReplicatePrediction;
```

**Verifier's reason:** The non-OK branch returns from runPrediction before the response is parsed as a prediction or polling begins.

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
  let prediction = (await createRes.json()) as ReplicatePrediction;
```

**Verifier's reason:** The non-OK branch returns from `runPrediction` before the subsequent response parsing and polling code, so the failed create response is not parsed as a prediction.

## R04

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
  let prediction = (await createRes.json()) as ReplicatePrediction;
```

**Verifier's reason:** The return exits runPrediction on a non-OK create response, so the subsequent JSON parsing and polling are not reached.

## R05

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
  let prediction = (await createRes.json()) as ReplicatePrediction;
```

**Verifier's reason:** The `return` is inside `runPrediction` and exits that function, so execution does not proceed to parse the response or poll after a non-OK create response.

## R06

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
  let prediction = (await createRes.json()) as ReplicatePrediction;
```

**Verifier's reason:** The non-OK branch returns from `runPrediction` before the response is parsed or polling begins. The claim that execution continues into parsing and polling is contradicted.
