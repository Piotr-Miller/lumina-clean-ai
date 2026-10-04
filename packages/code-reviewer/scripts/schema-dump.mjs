// Prints the JSON Schema the provider actually receives, so a field's
// description/required-ness can be checked without spending a call.
import { z } from "zod";

import { findingSchema, implReviewOutputSchema, verificationOutputSchema } from "../src/schemas.js";

const impl = z.toJSONSchema(implReviewOutputSchema);
const f = impl?.properties?.findings?.items;
console.log("IMPL finding — required:", JSON.stringify(f?.required));
console.log("  file      :", JSON.stringify(f?.properties?.file));
console.log("  startLine :", JSON.stringify(f?.properties?.startLine));

const fin = z.toJSONSchema(findingSchema);
console.log("\nFINDER finding — required:", JSON.stringify(fin?.required));
console.log("  file      :", JSON.stringify(fin?.properties?.file));

// The verifier's wire shape (change `finder-verification`): every field
// required, the verdict a string enum, and none of the constructs the provider
// subset drops (lessons.md) — the last line must read `none`.
const ver = z.toJSONSchema(verificationOutputSchema);
const v = ver?.properties?.verdicts?.items;
console.log("\nVERIFIER verdict — required:", JSON.stringify(v?.required));
console.log("  verdict   :", JSON.stringify(v?.properties?.verdict));
console.log("  quote     :", JSON.stringify(v?.properties?.quote));
const forbidden = ["oneOf", "anyOf", "minimum", "maximum"].filter((key) => JSON.stringify(ver).includes(`"${key}"`));
console.log("  forbidden constructs:", forbidden.length === 0 ? "none" : forbidden.join(", "));
