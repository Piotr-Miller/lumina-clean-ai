// Runnable demo (npm run dev): reviews a simulated diff through the library.
// This file owns process exit; the library only ever throws.

import { createReviewer, findingKey, lensSchema, type SourceProvider } from "./index.js";

const FILE_PATH = "src/users.js";

// Post-change content of the simulated file — served to the agent through the
// injected SourceProvider when it calls getFileContext.
const FILE_CONTENT = `export function listUsers(users) {
  return users.map((u) => u.name);
}

export function getUserAge(users, id) {
  for (var i = 0; i <= users.length; i++) {
    if (users[i].id == id) return users[i].age;
  }
}
`;

// Simulated unified diff introducing the buggy getUserAge (agent-generated
// fixture — the course task's "simulated diff" input).
const SIMULATED_DIFF = `diff --git a/src/users.js b/src/users.js
index 3f1c2aa..9be51d7 100644
--- a/src/users.js
+++ b/src/users.js
@@ -1,3 +1,9 @@
 export function listUsers(users) {
   return users.map((u) => u.name);
 }
+
+export function getUserAge(users, id) {
+  for (var i = 0; i <= users.length; i++) {
+    if (users[i].id == id) return users[i].age;
+  }
+}
`;

const source: SourceProvider = ({ path, startLine, endLine }) => {
  if (path !== FILE_PATH) return `Unknown file: ${path}`;
  if (startLine === undefined) return FILE_CONTENT;
  const lines = FILE_CONTENT.split("\n");
  return lines.slice(startLine - 1, endLine ?? lines.length).join("\n");
};

try {
  const lensArg = process.argv.at(2);
  const lens = lensArg === undefined ? undefined : lensSchema.parse(lensArg);

  const reviewer = createReviewer({ lens, source });
  console.log(`Reviewing simulated diff with ${reviewer.model} (lens: ${reviewer.lens})...\n`);

  const review = await reviewer.review({ kind: "diff", diff: SIMULATED_DIFF });

  console.log(`Summary: ${review.summary}\n`);
  for (const finding of review.findings) {
    console.log(`[${finding.severity}/${finding.category}] ${findingKey(finding)}`);
    console.log(`  ${finding.description}`);
    console.log(`  fix: ${finding.suggestion}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(`\nUsage: npm run dev [-- <lens>]  where <lens> is one of: ${lensSchema.options.join(", ")}`);
  process.exit(1);
}
