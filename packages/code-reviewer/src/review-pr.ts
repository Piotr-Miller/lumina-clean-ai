// CI entry (npm run review): diff in → review.json + comment.md out.
// Thin process shell — the whole contract lives (tested) in cli.ts. Exit-code
// contract: any produced verdict (incl. "failed") is exit 0 — advisory data;
// exit 1 means technical failure only (the action's posting steps rely on it).

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { runReviewCli, type CliIo } from "./cli.js";

const io: CliIo = {
  readStdin: () => readFileSync(0, "utf8"),
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
  log: (message) => {
    console.log(message);
  },
  logError: (message) => {
    console.error(message);
  },
};

// exitCode + natural drain instead of process.exit(1): a hard exit while a
// failed fetch's handles are closing trips a libuv assertion on Windows
// (exit code 127/abort instead of the contractual 1).
process.exitCode = await runReviewCli(process.argv.slice(2), process.env, io);
