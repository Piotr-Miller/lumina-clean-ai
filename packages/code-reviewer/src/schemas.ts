import { z } from "zod";

// Shared zod vocabulary for the reviewer: lenses, review units, and the
// normalized findings shape. Every future agent/orchestrator/eval speaks this.

export const lensSchema = z.enum(["general", "security", "performance", "correctness", "style"]);
export type Lens = z.infer<typeof lensSchema>;

export const severitySchema = z.enum(["critical", "major", "minor", "nit"]);
export type Severity = z.infer<typeof severitySchema>;

// No "general" here: every finding attributes a concrete dimension, whichever
// lens produced it. The general lens may emit any category.
export const categorySchema = z.enum(["security", "performance", "correctness", "style"]);
export type Category = z.infer<typeof categorySchema>;

export const findingSchema = z.object({
  file: z.string().min(1).describe("File path exactly as given in the review unit"),
  startLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Absolute 1-based line in the file where the issue starts; omit for file-level findings"),
  endLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Absolute 1-based line where the issue ends, if it spans a range"),
  severity: severitySchema.describe("How bad the issue is if left unfixed"),
  category: categorySchema.describe("Which review dimension the issue belongs to"),
  description: z.string().describe("What is wrong and why it matters"),
  suggestion: z.string().describe("Concrete fix or improvement"),
});
export type Finding = z.infer<typeof findingSchema>;

export const reviewResultSchema = z.object({
  summary: z.string().describe("One-sentence overall verdict on the reviewed code"),
  findings: z.array(findingSchema),
});
export type ReviewResult = z.infer<typeof reviewResultSchema>;

export const reviewUnitSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("diff"),
    diff: z.string().min(1).describe("Unified diff text"),
  }),
  z.object({
    kind: z.literal("file"),
    path: z.string().min(1),
    content: z.string().describe("Full file content"),
  }),
  z.object({
    kind: z.literal("hunk"),
    path: z.string().min(1),
    content: z.string().describe("The hunk's lines as they appear in the file"),
    startLine: z.number().int().min(1).describe("Absolute 1-based file line of the hunk's first line"),
  }),
]);
export type ReviewUnit = z.infer<typeof reviewUnitSchema>;
