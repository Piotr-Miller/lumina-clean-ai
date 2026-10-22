// CI entry (npm run weekly-report): GitHub facts in → report.md / report.json
// (+ alarm.md) out, then the week's comment and alarm issue upserted. Thin
// process shell — the whole contract lives (tested) in weekly-report-cli.ts.
// Exit 0 = a report was produced (alarm or not); exit 1 = it could not list
// runs or could not publish.

import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { GhRunner } from "./weekly-report-github.js";
import { runWeeklyReportCli, type WeeklyReportIo } from "./weekly-report-cli.js";

const gh: GhRunner = (args, input) =>
  new Promise((resolve) => {
    const child = spawn("gh", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    // A missing binary is a failed call with a readable reason, not a crash.
    child.on("error", (error) => {
      resolve({ code: 127, stdout, stderr: `gh could not be started: ${error.message}` });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.stdin.end(input ?? "");
  });

const io: WeeklyReportIo = {
  gh,
  now: () => new Date(),
  readFile: (path) => readFileSync(path, "utf8"),
  writeFile: (path, content) => {
    writeFileSync(path, content);
  },
  mkdir: (path) => {
    mkdirSync(path, { recursive: true });
  },
  appendFile: (path, content) => {
    appendFileSync(path, content);
  },
  makeTempDir: () => mkdtempSync(join(tmpdir(), "ai-review-weekly-")),
  removeDir: (path) => {
    rmSync(path, { recursive: true, force: true });
  },
  log: (message) => {
    console.log(message);
  },
  logError: (message) => {
    console.error(message);
  },
};

// exitCode + natural drain instead of process.exit(1), as in review-pr.ts.
process.exitCode = await runWeeklyReportCli(process.argv.slice(2), process.env, io);
