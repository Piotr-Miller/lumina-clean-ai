/**
 * Shared paths, records and the holdout guard for the S-19 TypeScript tools
 * (`baseline.ts`, `local-arms.ts`). The guard is not re-implemented here: it shells
 * out to `scripts/s19/protocol.py check-access`, the one implementation every
 * S-19 path uses, and treats any non-zero exit as a refusal.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import type { LocalParams, LumaStats } from "../../src/lib/engines/types";

export const REPO = resolve(import.meta.dirname, "../..");
export const PRIVATE = process.env.S19_PRIVATE ?? join(REPO, "test-photos/private/s19");

/** Written by `inputs.py` as `inputs/<id>.json`. */
export interface InputSidecar {
  id: string;
  split: "tuning" | "validation";
  common: { path: string; sha256: string; dimensions: [number, number] };
  nafnet: { path: string; sha256: string; dimensions: [number, number]; downscaled: boolean };
}

/** Written by `baseline.ts --serve` as `local/<id>.auto.json`. */
export interface AutoRecord {
  id: string;
  common_sha256: string;
  common_dimensions: [number, number];
  natural_dimensions: [number, number];
  stats: LumaStats;
  local: LocalParams;
  parameter_provenance: string;
  browser: { userAgent: string; fullVersionList: unknown };
  session_id: string;
  sampled_at: string;
  source_revision: { git_head: string; worktree_dirty: boolean; files: Record<string, string> };
  ui_labels?: { gamma?: string; blur?: string };
}

/** The app files whose behaviour an Auto record depends on. */
export const AUTO_SOURCES = ["src/lib/engines/auto-params.ts", "src/lib/engines/auto-params.client.ts"];

export class Refused extends Error {}

export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function repoPath(p: string): string {
  return isAbsolute(p) ? p : join(REPO, p);
}

export function readSidecar(id: string): InputSidecar {
  try {
    return JSON.parse(readFileSync(join(PRIVATE, "inputs", `${id}.json`), "utf8")) as InputSidecar;
  } catch {
    throw new Refused(
      `${id}: no prepared input in ${join(PRIVATE, "inputs")}; run python3 scripts/s19/inputs.py first`,
    );
  }
}

export interface GuardArgs {
  ids: string[];
  all: boolean;
  allValidation: boolean;
  validation: boolean;
  access?: string;
  config?: string;
}

/** Ask protocol.py whether these photos may be touched; returns the resolved ids. */
export function guard(args: GuardArgs): string[] {
  const argv = [join(REPO, "scripts/s19/protocol.py"), "check-access", "--ids", ...args.ids];
  if (args.all) argv.push("--all");
  if (args.allValidation) argv.push("--all-validation");
  if (args.validation) argv.push("--validation");
  if (args.access) argv.push("--access", args.access);
  if (args.config) argv.push("--config", args.config);
  try {
    const out = execFileSync("python3", argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return (JSON.parse(out) as { allowed: string[] }).allowed;
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    throw new Refused((err.stderr ?? err.message).trim().replace(/^refused: /, ""));
  }
}

/** Ask protocol.py whether these files may be read in this mode (metadata only, nothing is opened). */
export function guardPaths(paths: string[], validation: boolean): void {
  const argv = [join(REPO, "scripts/s19/protocol.py"), "check-paths", "--paths", ...paths];
  if (validation) argv.push("--validation");
  try {
    execFileSync("python3", argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    throw new Refused((err.stderr ?? err.message).trim().replace(/^refused: /, ""));
  }
}

/** Parse the flags both tools share; everything else is returned as positional ids. */
export function parseCommon(
  argv: string[],
): GuardArgs & { rest: string[]; flags: Set<string>; opts: Map<string, string> } {
  const out: GuardArgs & { rest: string[]; flags: Set<string>; opts: Map<string, string> } = {
    ids: [],
    all: false,
    allValidation: false,
    validation: false,
    rest: [],
    flags: new Set(),
    opts: new Map(),
  };
  const valued = new Set(["--access", "--config", "--port", "--source", "--nafnet-config"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (valued.has(a)) {
      if (i + 1 >= argv.length) throw new Refused(`${a} needs a value`);
      out.opts.set(a, argv[++i]);
    } else if (a === "--all") out.all = true;
    else if (a === "--all-validation") out.allValidation = true;
    else if (a === "--validation") out.validation = true;
    else if (a.startsWith("--")) out.flags.add(a);
    else out.rest.push(a);
  }
  out.access = out.opts.get("--access");
  out.config = out.opts.get("--config");
  return out;
}
