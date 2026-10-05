// Prints the JSON Schema the provider actually receives, so a field's
// description/required-ness can be checked without spending a call.
import { createHash } from "node:crypto";

import { z } from "zod";

import { tolerantReviewOutput } from "../src/output-repair.js";
import { findingSchema, implReviewOutputSchema } from "../src/schemas.js";

const impl = z.toJSONSchema(implReviewOutputSchema);
const f = impl?.properties?.findings?.items;
console.log("IMPL finding — required:", JSON.stringify(f?.required));
console.log("  file      :", JSON.stringify(f?.properties?.file));
console.log("  startLine :", JSON.stringify(f?.properties?.startLine));

const fin = z.toJSONSchema(findingSchema);
console.log("\nFINDER finding — required:", JSON.stringify(fin?.required));
console.log("  file      :", JSON.stringify(fin?.properties?.file));

// The finder's FULL output schema as the SDK hands it to the provider: the
// `responseFormat` of the same Output object reviewer.ts uses, so its
// converter, `name` and `description` are the production ones — not a fresh
// z.toJSONSchema, which can differ. The sha256 is over exactly the JSON
// printed, so a seal can record it and a later run can be compared against it.
// Run with tsx (plain node cannot resolve the .js imports to the TS sources).
const wire = await tolerantReviewOutput().responseFormat;
const wireJson = JSON.stringify(wire);
console.log("\nFINDER wire schema (review_result, as sent):");
console.log(wireJson);
console.log("FINDER wire schema sha256:", createHash("sha256").update(wireJson).digest("hex"));
