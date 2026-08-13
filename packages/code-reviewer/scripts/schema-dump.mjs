// Prints the JSON Schema the provider actually receives, so a field's
// description/required-ness can be checked without spending a call.
import { z } from "zod";

import { findingSchema, implReviewOutputSchema } from "../src/schemas.js";

const impl = z.toJSONSchema(implReviewOutputSchema);
const f = impl?.properties?.findings?.items;
console.log("IMPL finding — required:", JSON.stringify(f?.required));
console.log("  file      :", JSON.stringify(f?.properties?.file));
console.log("  startLine :", JSON.stringify(f?.properties?.startLine));

const fin = z.toJSONSchema(findingSchema);
console.log("\nFINDER finding — required:", JSON.stringify(fin?.required));
console.log("  file      :", JSON.stringify(fin?.properties?.file));
