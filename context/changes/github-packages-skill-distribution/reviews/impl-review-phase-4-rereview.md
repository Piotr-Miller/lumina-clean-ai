<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Phase 4.7 re-review

Date: 2026-09-06  
Reviewed implementation: `Piotr-Miller/ai-toolkit@97bdd36`  
CI evidence: run [34024986800](https://github.com/Piotr-Miller/ai-toolkit/actions/runs/34024986800), conclusion `success`.

## Verdict

**NEEDS ATTENTION (conditional approval)**. The previous activation blocker in workflow routing is fixed and the Ubuntu/Windows validation matrix is fully green. No registry write is authorized by this review. Before the Phase 5 first-publish decision, the residual limitations below must remain explicit and be accepted by the maintainer, or be addressed in code.

## Dimension verdicts

| Dimension           | Verdict                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------- |
| Plan adherence      | WARNING — access proof is partly manual because direct package grants are not enumerable |
| Scope discipline    | PASS                                                                                     |
| Safety & quality    | WARNING — registry/API ambiguity remains                                                 |
| Architecture        | PASS                                                                                     |
| Pattern consistency | PASS                                                                                     |
| Success criteria    | PASS — run 34024986800 green on both hosts                                               |

## Findings

### F1 — Registry/API absence is not a definitive existence proof

Severity: WARNING · Impact: MEDIUM · Dimension: Safety & Quality  
Location: `scripts/check-access.mjs` and access-policy evaluator

The registry-based `--expect-unpublished` check is appropriate for the first release, and the old `/user/packages` discovery weakness is removed. However, a private registry response such as `404` can also mean that the querying credential cannot read the package. The report must continue to describe this as an unprovable state, not as proof of non-existence. The six-hour watchdog must fail closed when it cannot distinguish those cases.

Fix: retain the explicit first-release `--expect-unpublished` mode and require the documented owner attestation/alternative authoritative credential for post-publication checks. Do not silently treat an ambiguous `404` as absent.

### F2 — Direct package grants remain a manual attestation

Severity: WARNING · Impact: HIGH · Dimension: Plan Adherence  
Location: `security/access-policy.json`, `docs/access-remediation.md`, publish workflow summary

The implementation now requires an attestation for direct grants and records that GitHub exposes no usable enumeration API. This is transparent and suitable for a human gate, but it is not an automated proof of owner-only package access. The attestation must therefore remain a hard prerequisite for both publish and promotion and must be accepted explicitly in Phase 5; it must not be presented as an API-verified green result.

Fix: keep the attestation required and include its scope, actor, timestamp, and evidence reference in the run summary/evidence record. If that cannot be supplied, fail closed.

### F3 — First-release attestation has vacuous package state

Severity: WARNING · Impact: MEDIUM · Dimension: Success Criteria  
Location: publish workflow access-gate path

Before the first publish there is no package object whose grants can be inspected. The workflow should state that the direct-grant portion is vacuously checked for the unpublished package, while repository visibility/collaborators and post-publication package access are checked separately. Otherwise the summary can imply stronger evidence than exists.

Fix: make the first-release exception explicit in the run summary and carry the post-publication verification into the Phase 5 rc evidence record.

### F4 — Stale explanatory comment

Severity: OBSERVATION · Impact: LOW · Dimension: Pattern Consistency  
Location: `scripts/check-access.mjs` header

The header still describes the superseded package-listing mechanism. Update it before activation so future reviewers do not infer the old proof model.

## Positive evidence

- Run `34024986800` passed both `validate (ubuntu-latest)` and `validate (windows-latest)`; all 136 unit tests and 13 packed-artifact tests passed.
- Consumer isolation is green after Lumina commit `478260c`.
- Routing is now encoded with `false && inputs.action == ...`; removing the disable term leaves mutually exclusive action selection.
- Promotion has its own `main` ref guard and access gate.
- No workflow is currently able to publish: both jobs remain disabled, only `workflow_dispatch` exists, and the watchdog schedule is not yet enabled.

## Recommendation

Do not activate yet. Keep the implementation as conditionally acceptable for 4.7, update the stale comment and first-release evidence wording, then obtain explicit maintainer acceptance of the manual direct-grant attestation and the six-hour ambiguity window. Only after that should a separate activation commit remove the `false &&` terms, add the watchdog schedule, rerun policy tests, and proceed to the independent Phase 5 first-publish gate.
