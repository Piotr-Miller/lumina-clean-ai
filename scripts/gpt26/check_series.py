#!/usr/bin/env python3
"""Offline check of a GPT26 study's pre-registration (plan `gpt-image-26-wider` Phase 1 §1).

    python3 scripts/gpt26/check_series.py --config <config>

Reads only repository files — no Pillow, private corpus, API key, network or runner import — and
writes nothing. For the study the config registers (`study.py`) it verifies that:

  - the study's paths are valid, its change folder is not archived, and its viewer's manifest
    base resolves to `study.private_root`;
  - the series registers exactly the config's `gate.expected_slots`, once each, with the input
    hashes and source/request sizes of `scripts/s19/series/phase5.json`, per-call cost bounds
    recomputed from the config, no prerequisites, and a first-attempt sum within
    `gate.cap_usd`;
  - the gate block is self-consistent (denominator = number of expected slots, a tie minimum
    within it, a finite positive cap) and keeps the fixed level, evidence and attempt rules;
  - the config keeps the phase-5 prompt byte-for-byte, sends `complexity=low` /
    `moderation=auto`, and records its definitions and blind-rating controls before any spend.

Exit 0 when the registration is complete; exit 1 with one line per discrepancy (or a refused
study) otherwise; exit 2 on usage. Each line names the file, the field and how to repair it.

The size and bound formulas below are local copies of `request_size` and `cost_bound` in
`scripts/s19/run-candidate.py` (which imports Pillow and `fcntl`). Tests pin their parity with
the runner.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import posixpath
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import study as study_mod  # noqa: E402

PHASE5_CONFIG = study_mod.PHASE5_CONFIG
PHASE5_SERIES = study_mod.PHASE5_SERIES

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
# The gate rules every GPT26 study keeps; the slots, denominator, tie minimum and cap are the
# study's own and are checked for consistency instead (plan Phase 1 §1).
GATE_INVARIANTS = {
    "max_attempts_per_slot": 2,
    "fidelity_levels": ["none", "minor", "significant", "severe"],
    "fidelity_blocking_levels": ["uncertain"],
    "fidelity_evidence_required_levels": ["significant", "severe"],
    "fidelity_disqualifying_levels": ["significant", "severe"],
    "undelivered_fidelity": "nieoceniona",
}
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
# The viewer's one manifest base line, as the S-20 viewer writes it.
VIEWER_BASE = re.compile(r'^\s*const base = "([^"]*)" \+ setId \+ "/";\s*$', re.M)


class Unreadable(Exception):
    pass


def read_json(rel: str, root: Path = ROOT) -> tuple[bytes, object]:
    try:
        raw = study_mod.read_regular(root, rel)
    except (OSError, study_mod.StudyError) as e:
        raise Unreadable(f"{rel}: cannot read ({e}) — restore the file from Git") from e
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


def check_calculation_config(config: object, where: str) -> list[str]:
    """Validate arithmetic inputs before dependent series checks can run."""
    CONFIG = where
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


def finite_positive(value) -> bool:
    return type(value) in (int, float) and math.isfinite(value) and value > 0


def check_viewer(root: Path, study: study_mod.Study, raw: bytes | None = None) -> list[str]:
    """The registered viewer loads its sets from `study.private_root` (plan Phase 3 §1)."""
    try:
        text = (study_mod.read_regular(root, study.viewer) if raw is None else raw).decode("utf-8")
    except (OSError, UnicodeDecodeError, study_mod.StudyError) as e:
        return [f"{study.viewer}: cannot read the study's viewer ({e}) — restore it"]
    bases = VIEWER_BASE.findall(text)
    if len(bases) != 1:
        return [f"{study.viewer}: {len(bases)} manifest base lines (`const base = \"…\" + setId + \"/\";`), "
                "expected exactly one"]
    resolved = posixpath.normpath(posixpath.join(posixpath.dirname(study.viewer), bases[0]))
    if resolved != study.private_root:
        return [f"{study.viewer}: the manifest base {bases[0]!r} resolves to {resolved!r}, not the study's "
                f"private_root {study.private_root!r} — point the viewer at the study's sets"]
    return []


def check_config(config: object, phase5: dict, study: study_mod.Study, root: Path = ROOT, *,
                 viewer_raw: bytes | None = None) -> list[str]:
    CONFIG = study.config
    errs: list[str] = []
    if not isinstance(config, dict):
        return [f"{CONFIG}: top level is not an object — regenerate the config"]
    name = config.get("name")
    if not isinstance(name, str) or not study_mod.PATH_COMPONENT.fullmatch(name):
        errs.append(f"{CONFIG}: name must be a single output directory name using letters, digits, '_' or '-'")
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
        for key, want in GATE_INVARIANTS.items():
            if gate.get(key) != want:
                errs.append(f"{CONFIG}: gate.{key} is {gate.get(key)!r}, expected {want!r}")
        n = len(study.expected_slots)
        denominator = gate.get("denominator")
        if type(denominator) is not int or denominator != n:
            errs.append(f"{CONFIG}: gate.denominator is {denominator!r}; it must equal the {n} expected slots "
                        "(an undelivered slot is never excluded)")
        ties = gate.get("min_tie_pairs")
        if type(ties) is not int or not 1 <= ties <= n:
            errs.append(f"{CONFIG}: gate.min_tie_pairs is {ties!r}; it must be an integer from 1 to {n}")
        if not finite_positive(gate.get("cap_usd")) or type(gate.get("cap_usd")) is bool:
            errs.append(f"{CONFIG}: gate.cap_usd is {gate.get('cap_usd')!r}; register a finite positive cap")
        for key in ("statement", "tie_rule", "pass_opens"):
            if not isinstance(gate.get(key), str) or not gate.get(key).strip():
                errs.append(f"{CONFIG}: gate.{key} is missing or empty")
        definitions = gate.get("definitions")
        if not isinstance(definitions, list) or not definitions:
            errs.append(f"{CONFIG}: gate.definitions must be a non-empty list — register the plan's Definitions rows")
            definitions = []
        terms = [d.get("term") if isinstance(d, dict) else None for d in definitions]
        if any(not isinstance(t, str) or not t.strip() for t in terms) or len(set(terms)) != len(terms):
            errs.append(f"{CONFIG}: gate.definitions terms {terms!r} must be non-empty and unique")
        for d in definitions:
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
    return errs + check_viewer(root, study, viewer_raw)


def check_series(series: object, config: dict, config_sha: str, phase5_series: dict,
                 study: study_mod.Study) -> list[str]:
    CONFIG, SERIES = study.config, study.series
    expected = list(study.expected_slots)
    denominator = len(expected)
    errs: list[str] = []
    if not isinstance(series, dict):
        return [f"{SERIES}: top level is not an object — regenerate the series"]
    if series.get("series_id") != study.series_id:
        errs.append(f"{SERIES}: series_id is {series.get('series_id')!r}, the study registers {study.series_id!r}")
    if not isinstance(series.get("phase"), int):
        errs.append(f"{SERIES}: phase must be an integer phase id")
    if series.get("manifest_sha256") != phase5_series.get("manifest_sha256"):
        errs.append(f"{SERIES}: manifest_sha256 differs from {PHASE5_SERIES}")
    if series.get("prerequisites") != []:
        errs.append(f"{SERIES}: prerequisites must be an empty list (a GPT26 study has none)")
    configs = series.get("configs")
    if not isinstance(configs, dict) or list(configs) != [config_sha]:
        keys = list(configs) if isinstance(configs, dict) else configs
        errs.append(
            f"{SERIES}: configs keys are {keys!r}, expected only the current sha256 of {CONFIG} ({config_sha}) — "
            "the config changed after the series was fixed, or the series was not regenerated"
        )
    elif not isinstance(configs[config_sha], dict) or configs[config_sha].get("path") != CONFIG:
        errs.append(f"{SERIES}: configs[{config_sha[:12]}…].path is not {CONFIG}")

    slots = series.get("slots")
    if not isinstance(slots, list):
        return errs + [f"{SERIES}: slots is not a list"]
    if len(slots) != denominator:
        errs.append(f"{SERIES}: {len(slots)} slot(s), expected exactly {denominator}")
    p5 = {(s["photo"], s["slot"]): s for s in phase5_series.get("slots", [])}
    seen: dict[tuple, int] = {}
    total = 0.0
    for i, s in enumerate(slots):
        if not isinstance(s, dict):
            errs.append(f"{SERIES}: slots[{i}] is not an object")
            continue
        key = (s.get("photo"), s.get("slot"))
        where = f"{SERIES}: slot {key[0]}/{key[1]}"
        seen[key] = seen.get(key, 0) + 1
        if seen[key] == 2:
            errs.append(f"{where} appears more than once — each slot is registered once")
        if key not in expected:
            errs.append(f"{where} is not one of the config's gate.expected_slots — remove it")
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
        total += want
    for key in expected:
        if key not in seen:
            errs.append(f"{SERIES}: slot {key[0]}/{key[1]} is missing — the denominator is always {denominator}")
    cap = (config.get("gate") or {}).get("cap_usd") if isinstance(config.get("gate"), dict) else None
    if finite_positive(cap) and round(total, 2) > cap + 1e-9:
        errs.append(f"{SERIES}: first-attempt bounds total ${total:.2f}, above the registered gate.cap_usd "
                    f"${cap:.2f} — the cap must cover every first attempt")
    return errs


def main(argv: list[str] | None = None, *, root: Path = ROOT) -> int:
    # A Windows console's code page cannot encode "≠"/"…"; never let a report die on its own message.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description="Offline check of a GPT26 study's pre-registration")
    ap.add_argument("--config", required=True, help="the study's config (repo-relative or inside the checkout)")
    args = ap.parse_args(argv)
    try:
        study, config_raw, config = study_mod.load(root, args.config)
    except study_mod.StudyError as e:
        print(f"check_series: REFUSED — {e}", file=sys.stderr)
        return 1
    try:
        _, series = read_json(study.series, root)
        _, phase5 = read_json(PHASE5_CONFIG, root)
        _, phase5_series = read_json(PHASE5_SERIES, root)
    except Unreadable as e:
        print(f"check_series: REFUSED — {e}", file=sys.stderr)
        return 1
    config_sha = hashlib.sha256(config_raw).hexdigest()
    calculation_errs = check_calculation_config(config, study.config)
    errs = check_config(config, phase5, study, root) + calculation_errs
    if not calculation_errs:
        errs += check_series(series, config, config_sha, phase5_series, study)
    else:
        errs.append(f"{study.series}: not checked — {study.config} has invalid calculation fields")
    if errs:
        print(f"check_series: FAIL — {len(errs)} discrepancy(ies) in the GPT26 registration:", file=sys.stderr)
        for e in errs:
            print(f"  - {e}", file=sys.stderr)
        return 1
    bounds = [s["cost_bound_usd"] for s in series["slots"]]
    print(
        f"check_series: OK — {study.series} registers {len(bounds)} slots ({', '.join(study.labels)}) "
        f"against {study.config} sha256 {config_sha}; first-attempt bounds total ${sum(bounds):.2f} "
        f"within the registered cap ${config['gate']['cap_usd']:.2f}."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
