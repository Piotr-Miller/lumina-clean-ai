/**
 * CLI for the `gauntlet-loop` skill's blind staging. Runs identically in
 * PowerShell and Git Bash — unlike `sha256sum`, which this repo's primary shell
 * does not have.
 *
 *   npx tsx scripts/gauntlet-stage.ts stage  --ours <path> --bar <path> --round <dir>
 *   npx tsx scripts/gauntlet-stage.ts reveal --round <dir> --bar <path> [--ours <path>]
 *   npx tsx scripts/gauntlet-stage.ts hash   <file...>
 *
 * Every command is a SINGLE line. No `\` continuations in the docs that quote
 * them: that is Bash-only, and this repo's primary shell is PowerShell, where it
 * silently splits the call into two broken commands.
 *
 * `stage` prints only the two paths to hand the critic. It deliberately does not
 * print, return, or store which side is ours — see the module header in
 * scripts/lib/gauntlet-staging.ts. Run `reveal` after the verdict is recorded;
 * `--ours` is optional there and buys the stronger tamper check (both staged
 * files verified, not just the reference side).
 *
 * Exit codes: 0 ok, 1 usage error, 2 staging/reveal error.
 */
/* eslint-disable no-console -- staging CLI: stdout is its interface */
import { hashFile, revealSide, stageRound } from "./lib/gauntlet-staging";

const USAGE = `Usage:
  gauntlet-stage stage  --ours <path> --bar <path> --round <dir>
  gauntlet-stage reveal --round <dir> --bar <path> [--ours <path>]
  gauntlet-stage hash   <file...>`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
}

function main(): void {
  const [command, ...args] = process.argv.slice(2);

  if (command === "stage") {
    const [ours, bar, round] = [flag(args, "ours"), flag(args, "bar"), flag(args, "round")];
    if (!ours || !bar || !round) {
      console.error(USAGE);
      process.exit(1);
    }
    const result = stageRound({ ours, bar, roundDir: round });
    for (const warning of result.warnings) console.error(`warning: ${warning}`);
    console.log(`Hand the critic exactly these two paths, and nothing else:`);
    for (const path of result.staged) console.log(`  ${path}`);
    console.log(`\nWhich one is ours is NOT recorded anywhere. After the verdict:`);
    console.log(`  npx tsx scripts/gauntlet-stage.ts reveal --round ${result.roundDir} --bar ${bar} --ours ${ours}`);
    return;
  }

  if (command === "reveal") {
    const [round, bar, ours] = [flag(args, "round"), flag(args, "bar"), flag(args, "ours")];
    if (!round || !bar) {
      console.error(USAGE);
      process.exit(1);
    }
    console.log(`ours=${revealSide(round, bar, { ours })}`);
    if (!ours) {
      // Say what was NOT checked, so nobody reads a clean reveal as "untampered".
      console.error(
        `note: only the reference side was verified. An edit to the ours side alone changes no hash this compares — re-run with --ours <path as staged> for the full check.`,
      );
    }
    return;
  }

  if (command === "hash") {
    if (args.length === 0) {
      console.error(USAGE);
      process.exit(1);
    }
    for (const file of args) console.log(`${hashFile(file)}  ${file}`);
    return;
  }

  console.error(USAGE);
  process.exit(1);
}

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
