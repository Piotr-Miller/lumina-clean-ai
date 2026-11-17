#!/usr/bin/env python3
"""Offline check of the GPT26 screen's pre-registration (plan.md Phase 1 §4).

Reads only repository JSON — no Pillow, private corpus, API key, network or runner import — and
writes nothing. It verifies that `scripts/gpt26/series/screen.json` registers exactly the six
slots S17-03/04/07 × slots 1/2 against `scripts/gpt26/configs/gpt26-low.json`, with the input
hashes and source/request sizes of `scripts/s19/series/phase5.json`, per-call cost bounds
recomputed from the config, no prerequisites and a gate denominator of six. It also checks that
the config keeps the phase-5 prompt byte-for-byte, sends `complexity=low` / `moderation=auto`,
and records the blind-rating controls before any spend.

Exit 0 when the registration is complete; exit 1 with one line per discrepancy otherwise. Each
line names the file, the field and how to repair it.

    python3 scripts/gpt26/check_series.py

The size and bound formulas below are local copies of `request_size` and `cost_bound` in
`scripts/s19/run-candidate.py` (which imports Pillow and `fcntl`). Phase 2 tests pin their parity
with the runner.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFIG = "scripts/gpt26/configs/gpt26-low.json"
SERIES = "scripts/gpt26/series/screen.json"
PHASE5_CONFIG = "scripts/s19/configs/phase5-gpt.json"
PHASE5_SERIES = "scripts/s19/series/phase5.json"

EXPECTED_SLOTS = [(photo, slot) for photo in ("S17-03", "S17-04", "S17-07") for slot in (1, 2)]
DENOMINATOR = 6
REQUEST_FIELDS = {"complexity": "low", "moderation": "auto"}
MODEL = "gpt-image-2.6-sunburst"
COPIED_FROM_PHASE5 = ("endpoint", "prompt", "quality", "output_format", "n", "input", "size_rule", "validity", "retry")
COST_FIELDS = (
    "output_image_tokens_per_megapixel",
    "input_image_tokens",
    "input_text_tokens",
    "usd_per_million_output_image_tokens",
    "usd_per_million_input_image_tokens",
    "usd_per_million_input_text_tokens",
    "rounding_usd",
)
GATE_VALUES = {
    "denominator": DENOMINATOR,
    "max_attempts_per_slot": 2,
    "fidelity_levels": ["none", "minor", "significant", "severe"],
    "fidelity_blocking_levels": ["uncertain"],
    "fidelity_evidence_required_levels": ["significant", "severe"],
    "fidelity_disqualifying_levels": ["significant", "severe"],
    "min_tie_pairs": 4,
    "undelivered_fidelity": "nieoceniona",
}
DEFINITION_TERMS = [
    "slot",
    "delivered output",
    "all 6 outputs (denominator)",
    "fidelity loss",
    "pair",
    "at least a tie (fidelity)",
    "majority of pairs",
    "gate verdict",
    "real Local",
    "comparison scale",
]
BLIND_FIELDS = ("two_pass_rating", "repeated_local_recognition_risk", "owner_commitment", "comparison_scale", "real_local")
SLOT_FIELDS = {
    "config_sha256",
    "config_name",
    "kind",
    "photo",
    "slot",
    "role",
    "input",
    "input_sha256",
    "input_dimensions",
    "request_size",
    "cost_bound_usd",
    "requires",
}


class Unreadable(Exception):
    pass


def read_json(rel: str) -> tuple[bytes, object]:
    path = ROOT / rel
    try:
        raw = path.read_bytes()
    except OSError as e:
        raise Unreadable(f"{rel}: cannot read ({e.strerror or e}) — restore the file from Git") from e
    try:
        return raw, json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as e:
        raise Unreadable(f"{rel}: not valid UTF-8 JSON ({e}) — fix the syntax and re-run") from e


def request_size(width: int, height: int, rule: dict) -> tuple[int, int] | None:
    """Local copy of run-candidate.request_size; None where the runner would refuse."""
    m, cap, max_edge = rule["multiple"], rule["max_pixels"], rule["max_edge"]
    long_in, short_in = max(width, height), min(width, height)
    aspect = long_in / short_in
    if aspect > rule.get("max_aspect", 3.0):
        return None
    for short in range(max_edge // m * m, 0, -m):
        long = round(short * aspect / m) * m
        if long <= max_edge and long * short <= cap:
            if long * short < rule["min_pixels"]:
                return None
            return (long, short) if width >= height else (short, long)
    return None


def cost_bound(config: dict, size: tuple[int, int]) -> float:
    """Local copy of run-candidate.cost_bound for kind 'gpt', rounded up to the cent."""
    b = config["cost_bound"]
    mp = size[0] * size[1] / 1e6
    usd = (
        math.ceil(mp * b["output_image_tokens_per_megapixel"]) * b["usd_per_million_output_image_tokens"]
        + b["input_image_tokens"] * b["usd_per_million_input_image_tokens"]
        + b["input_text_tokens"] * b["usd_per_million_input_text_tokens"]
    ) / 1e6 + b["rounding_usd"]
    return math.ceil(usd * 100 - 1e-9) / 100


def check_calculation_config(config: object) -> list[str]:
    """Validate arithmetic inputs before dependent series checks can run."""
    errs: list[str] = []
    if not isinstance(config, dict):
        return [f"{CONFIG}: calculation fields require a config object — restore it from {PHASE5_CONFIG}"]
    for block in ("size_rule", "cost_bound"):
        if not isinstance(config.get(block), dict):
            errs.append(f"{CONFIG}: {block} must be an object — restore it from {PHASE5_CONFIG}")
    rule = config.get("size_rule")
    if isinstance(rule, dict):
        for key in ("multiple", "max_pixels", "min_pixels", "max_edge"):
            value = rule.get(key)
            if type(value) is not int or value <= 0:
                errs.append(f"{CONFIG}: size_rule.{key} must be a positive integer — restore it from {PHASE5_CONFIG}")
        aspect = rule.get("max_aspect", 3.0)
        if type(aspect) not in (int, float) or not math.isfinite(aspect) or aspect <= 0:
            errs.append(f"{CONFIG}: size_rule.max_aspect must be finite and positive — restore it from {PHASE5_CONFIG}")
    bound = config.get("cost_bound")
    if isinstance(bound, dict):
        for key in COST_FIELDS:
            value = bound.get(key)
            if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
                errs.append(f"{CONFIG}: cost_bound.{key} must be finite and nonnegative — restore it from {PHASE5_CONFIG}")
    return errs


def check_config(config: object, phase5: dict) -> list[str]:
    errs: list[str] = []
    if not isinstance(config, dict):
        return [f"{CONFIG}: top level is not an object — regenerate the config"]
    if config.get("kind") != "gpt":
        errs.append(f"{CONFIG}: kind is {config.get('kind')!r}, expected 'gpt'")
    if config.get("model") != MODEL:
        errs.append(f"{CONFIG}: model is {config.get('model')!r}, expected {MODEL!r}")
    for key in COPIED_FROM_PHASE5:
        if config.get(key) != phase5.get(key):
            errs.append(f"{CONFIG}: {key} differs from {PHASE5_CONFIG} — the plan keeps it unchanged; copy it back")
    if config.get("request_fields") != REQUEST_FIELDS:
        errs.append(f"{CONFIG}: request_fields is {config.get('request_fields')!r}, expected {REQUEST_FIELDS!r}")
    retry = config.get("retry") if isinstance(config.get("retry"), dict) else {}
    if retry.get("max_retries") != 1 or retry.get("retry_error_codes") != ["moderation_blocked"]:
        errs.append(f"{CONFIG}: retry must be max_retries=1 with retry_error_codes=['moderation_blocked']")
    bound = config.get("cost_bound") if isinstance(config.get("cost_bound"), dict) else {}
    for key in COST_FIELDS:
        if bound.get(key) != phase5.get("cost_bound", {}).get(key):
            errs.append(f"{CONFIG}: cost_bound.{key} differs from {PHASE5_CONFIG} — the plan keeps the bound unchanged")
    if config.get("implementation") != phase5.get("implementation"):
        errs.append(f"{CONFIG}: implementation pins differ from {PHASE5_CONFIG}")
    gate = config.get("gate")
    if not isinstance(gate, dict):
        errs.append(f"{CONFIG}: gate block missing — the gate must be registered before any render")
    else:
        for key, want in GATE_VALUES.items():
            if gate.get(key) != want:
                errs.append(f"{CONFIG}: gate.{key} is {gate.get(key)!r}, expected {want!r}")
        want_slots = [{"photo": p, "slot": s} for p, s in EXPECTED_SLOTS]
        if gate.get("expected_slots") != want_slots:
            errs.append(f"{CONFIG}: gate.expected_slots must list exactly S17-03/04/07 × slots 1, 2 in that order")
        for key in ("statement", "tie_rule", "pass_opens"):
            if not isinstance(gate.get(key), str) or not gate.get(key).strip():
                errs.append(f"{CONFIG}: gate.{key} is missing or empty")
        terms = [d.get("term") for d in gate.get("definitions", []) if isinstance(d, dict)]
        if terms != DEFINITION_TERMS:
            errs.append(f"{CONFIG}: gate.definitions terms are {terms!r}, expected the plan's ten Definitions rows")
        for d in gate.get("definitions", []):
            if isinstance(d, dict) and not all(
                isinstance(d.get(k), str) and d.get(k).strip() for k in ("decided_meaning", "on_degenerate_data")
            ):
                errs.append(f"{CONFIG}: gate.definitions[{d.get('term')!r}] lacks its meaning or degenerate-data rule")
    blind = config.get("blind_protocol")
    if not isinstance(blind, dict):
        errs.append(f"{CONFIG}: blind_protocol block missing — record the rating controls before spend")
    else:
        for key in BLIND_FIELDS:
            if not isinstance(blind.get(key), str) or not blind.get(key).strip():
                errs.append(f"{CONFIG}: blind_protocol.{key} is missing or empty")
    return errs


def check_series(series: object, config: dict, config_sha: str, phase5_series: dict) -> list[str]:
    errs: list[str] = []
    if not isinstance(series, dict):
        return [f"{SERIES}: top level is not an object — regenerate the series"]
    if series.get("series_id") != "gpt26-screen":
        errs.append(f"{SERIES}: series_id is {series.get('series_id')!r}, expected 'gpt26-screen'")
    if not isinstance(series.get("phase"), int):
        errs.append(f"{SERIES}: phase must be an integer phase id")
    if series.get("manifest_sha256") != phase5_series.get("manifest_sha256"):
        errs.append(f"{SERIES}: manifest_sha256 differs from {PHASE5_SERIES}")
    if series.get("prerequisites") != []:
        errs.append(f"{SERIES}: prerequisites must be an empty list (the screen has none)")
    configs = series.get("configs")
    if not isinstance(configs, dict) or list(configs) != [config_sha]:
        keys = list(configs) if isinstance(configs, dict) else configs
        errs.append(
            f"{SERIES}: configs keys are {keys!r}, expected only the current sha256 of {CONFIG} ({config_sha}) — "
            "the config changed after the series was fixed, or the series was not regenerated"
        )
    elif configs[config_sha].get("path") != CONFIG:
        errs.append(f"{SERIES}: configs[{config_sha[:12]}…].path is not {CONFIG}")

    slots = series.get("slots")
    if not isinstance(slots, list):
        return errs + [f"{SERIES}: slots is not a list"]
    if len(slots) != DENOMINATOR:
        errs.append(f"{SERIES}: {len(slots)} slot(s), expected exactly {DENOMINATOR}")
    p5 = {(s["photo"], s["slot"]): s for s in phase5_series.get("slots", [])}
    seen: dict[tuple, int] = {}
    for i, s in enumerate(slots):
        if not isinstance(s, dict):
            errs.append(f"{SERIES}: slots[{i}] is not an object")
            continue
        key = (s.get("photo"), s.get("slot"))
        where = f"{SERIES}: slot {key[0]}/{key[1]}"
        seen[key] = seen.get(key, 0) + 1
        if seen[key] == 2:
            errs.append(f"{where} appears more than once — each slot is registered once")
        if key not in EXPECTED_SLOTS:
            errs.append(f"{where} is not one of S17-03/04/07 × slots 1, 2 — remove it")
            continue
        if set(s) != SLOT_FIELDS:
            errs.append(f"{where}: fields {sorted(set(s) ^ SLOT_FIELDS)} differ from the phase-5 slot schema")
        if s.get("config_sha256") != config_sha:
            errs.append(f"{where}: config_sha256 is not the current sha256 of {CONFIG}")
        if s.get("config_name") != config.get("name") or s.get("kind") != "gpt":
            errs.append(f"{where}: config_name/kind do not match {CONFIG}")
        if s.get("requires") != []:
            errs.append(f"{where}: requires must be [] (no prerequisites)")
        src = p5.get((key[0], 1))
        if src is None:
            errs.append(f"{where}: {PHASE5_SERIES} has no slot {key[0]}/1 to copy the input from")
            continue
        for field in ("input", "input_sha256", "input_dimensions", "request_size"):
            if s.get(field) != src.get(field):
                errs.append(f"{where}: {field} is {s.get(field)!r}, {PHASE5_SERIES} has {src.get(field)!r}")
        valid_dimensions = True
        for field in ("input_dimensions", "request_size"):
            dims = s.get(field)
            if not (
                isinstance(dims, list)
                and len(dims) == 2
                and all(type(d) is int and d > 0 for d in dims)
            ):
                errs.append(f"{where}: {field} must be two positive integers — fix the dimensions")
                valid_dimensions = False
        if not valid_dimensions:
            continue
        dims = s["input_dimensions"]
        req = s["request_size"]
        size = request_size(dims[0], dims[1], config["size_rule"])
        if size is None or list(size) != req:
            errs.append(f"{where}: request_size {req!r} ≠ the size rule's {size!r}")
        want = cost_bound(config, (req[0], req[1]))
        if s.get("cost_bound_usd") != want:
            errs.append(f"{where}: cost_bound_usd is {s.get('cost_bound_usd')!r}, the config gives {want}")
    for key in EXPECTED_SLOTS:
        if key not in seen:
            errs.append(f"{SERIES}: slot {key[0]}/{key[1]} is missing — the denominator is always {DENOMINATOR}")
    return errs


def main() -> int:
    # A Windows console's code page cannot encode "≠"/"…"; never let a report die on its own message.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    try:
        config_raw, config = read_json(CONFIG)
        _, series = read_json(SERIES)
        _, phase5 = read_json(PHASE5_CONFIG)
        _, phase5_series = read_json(PHASE5_SERIES)
    except Unreadable as e:
        print(f"check_series: REFUSED — {e}", file=sys.stderr)
        return 1
    config_sha = hashlib.sha256(config_raw).hexdigest()
    calculation_errs = check_calculation_config(config)
    errs = check_config(config, phase5) + calculation_errs
    if not calculation_errs:
        errs += check_series(series, config, config_sha, phase5_series)
    else:
        errs.append(f"{SERIES}: not checked — {CONFIG} has invalid calculation fields")
    if errs:
        print(f"check_series: FAIL — {len(errs)} discrepancy(ies) in the GPT26 registration:", file=sys.stderr)
        for e in errs:
            print(f"  - {e}", file=sys.stderr)
        return 1
    bounds = [s["cost_bound_usd"] for s in series["slots"]]
    print(
        f"check_series: OK — {SERIES} registers {len(bounds)} slots ({', '.join(f'{p}/{n}' for p, n in EXPECTED_SLOTS)}) "
        f"against {CONFIG} sha256 {config_sha}; first-attempt bounds total ${sum(bounds):.2f}."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
