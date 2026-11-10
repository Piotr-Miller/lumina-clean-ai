"""S-20 step 1 trials: one row of per-trial values per trial (plan Phase 8 item 1).

Every S-20 tool except the frozen `nlm.py` takes `--trial` (default `1a`) and reads its paths,
arm, record key, bind, report wording and `DECIDED` text from the selected row, never from a
module constant. The 1a row holds today's literals byte for byte: 1a's committed seals, freeze,
gate report and audit bundle re-derive only while every one of them stays as it is (impl of plan
review F20). A 1b run never reads, writes or deletes a 1a path, and the reverse.

No imports beyond the standard library: `evidence.py`, which the frozen `nlm.py` reads, imports
this table.
"""

from __future__ import annotations

from dataclasses import dataclass

CHANGE = "context/changes/cloud-classical-denoise"
EVAL = f"{CHANGE}/evaluations"


@dataclass(frozen=True)
class Trial:
    name: str
    title: str  # the heading of every Markdown file the tools write for this trial
    # evidence, relative to the repository
    pilot_seal: str
    pilot_ratings: str
    pilot_result: str
    pilot_stop: str | None  # a STOP pilot's report; None: STOP writes only the pilot result (1a)
    gate_seal: str
    gate_ratings: str
    gate_json: str
    gate_md: str
    audit_dir: str
    # rules
    frozen: str
    grid: str
    calibration: str
    # renders and records
    raw_dir: str  # test-photos/private/s20/<raw_dir>/k<k>/<id>.{png,json}
    arm: str  # the treatment arm, matched to control-full
    source_kind: str  # the arm record's `source.kind`
    record_key: str  # the key field naming the raw render's record
    record_sha_key: str
    bind_trial: str | None  # the bind line's `trial=` value; None: the line carries no `trial=` (F24)
    bind_fields: tuple[str, ...]
    renderer: str  # the S-20 tool that writes the raw renders and the calibration record
    renderer_libs: str  # the pinned libraries a re-render names in its way out
    # report wording
    prefix: str  # report keys `<prefix>_fidelity`, … and quality values `<prefix>-slight`, `<prefix>-clear`
    label: str  # the treatment in prose: "significant or severe <label> fidelity loss"
    decided: str  # pilot.py's rule text, embedded in the freeze and the pilot result
    pointer: str  # the verdict the S-20 pointers link, relative to the change folder
    stop_pointer: str | None  # the STOP report the pointers link instead after a STOP pilot

    @property
    def flag(self) -> str:
        """The `--trial` argument a printed command needs: none for the default 1a."""
        return "" if self.name == DEFAULT else f" --trial {self.name}"


DEFAULT = "1a"
STEP1B = f"{EVAL}/step1b"

TRIALS = {
    "1a": Trial(
        name="1a",
        title="S-20 step 1a",
        pilot_seal=f"{EVAL}/pilot-sealed.md",
        pilot_ratings=f"{EVAL}/pilot-ratings.json",
        pilot_result=f"{EVAL}/pilot-result.json",
        pilot_stop=None,
        gate_seal=f"{EVAL}/gate-sealed.md",
        gate_ratings=f"{EVAL}/gate-ratings.json",
        gate_json=f"{EVAL}/step1-gate.json",
        gate_md=f"{EVAL}/step1-gate.md",
        audit_dir=f"{EVAL}/step1-audit",
        frozen="scripts/s20/configs/nlm-frozen.json",
        grid="scripts/s20/configs/nlm-grid.json",
        calibration=f"{EVAL}/step1-calibration.md",
        raw_dir="nlm",
        arm="nlm-gamma",
        source_kind="nlm",
        record_key="nlm_record",
        record_sha_key="nlm_record_sha256",
        bind_trial=None,
        bind_fields=("implementation_sha256", "config_sha256", "opencv_version"),
        renderer="nlm.py",
        renderer_libs="OpenCV",
        prefix="nlm",
        label="NLM",
        decided=("pilot.py: plan § Definitions 'Pilot vote' (owner decision 2026-11-05, change.md § Owner decisions "
                 "(2026-11-05) item 5): most votes wins, a tie goes to the weaker k, 'none' counts for no strength"),
        pointer="evaluations/step1-gate.md",
        stop_pointer=None,
    ),
    "1b": Trial(
        name="1b",
        title="S-20 step 1b",
        pilot_seal=f"{STEP1B}/pilot-sealed.md",
        pilot_ratings=f"{STEP1B}/pilot-ratings.json",
        pilot_result=f"{STEP1B}/pilot-result.json",
        pilot_stop=f"{STEP1B}/pilot-stop.md",
        gate_seal=f"{STEP1B}/gate-sealed.md",
        gate_ratings=f"{STEP1B}/gate-ratings.json",
        gate_json=f"{STEP1B}/gate.json",
        gate_md=f"{STEP1B}/gate.md",
        audit_dir=f"{STEP1B}/audit",
        frozen="scripts/s20/configs/wavelet-frozen.json",
        grid="scripts/s20/configs/wavelet-grid.json",
        calibration=f"{STEP1B}/calibration.md",
        raw_dir="wavelet",
        arm="wavelet-gamma",
        source_kind="wavelet",
        record_key="wavelet_record",
        record_sha_key="wavelet_record_sha256",
        bind_trial="1b",
        bind_fields=("implementation_sha256", "config_sha256", "skimage_version", "pywt_version", "numpy_version"),
        renderer="wavelet.py",
        renderer_libs="scikit-image, PyWavelets and numpy",
        prefix="wavelet",
        label="wavelet",
        decided=("pilot.py --trial 1b: plan § 1b Definitions '1b gate', which keeps § Definitions 'Pilot vote' "
                 "(owner decision 2026-11-05, change.md § Owner decisions (2026-11-05) item 5): most votes wins, "
                 "a tie goes to the weaker k, 'none' counts for no strength"),
        pointer="evaluations/step1b/gate.md",
        stop_pointer="evaluations/step1b/pilot-stop.md",
    ),
}


def trial_arg(value: str) -> Trial:
    """argparse `type=`: an unknown trial is a usage error (exit 2), like every S-20 usage error."""
    import argparse

    if value not in TRIALS:
        raise argparse.ArgumentTypeError(f"unknown trial {value!r}; one of {', '.join(sorted(TRIALS))}")
    return TRIALS[value]


def add_argument(ap) -> None:
    ap.add_argument("--trial", type=trial_arg, default=TRIALS[DEFAULT],
                    help=f"the step 1 trial ({', '.join(sorted(TRIALS))}; default {DEFAULT})")
