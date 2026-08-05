import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import { z } from "zod";

const envSchema = z.object({
  OPENROUTER_API_KEY: z
    .string("missing — get a key at https://openrouter.ai/keys and put it in packages/code-reviewer/.env")
    .min(1, "empty — get a key at https://openrouter.ai/keys and put it in packages/code-reviewer/.env"),
  OPENROUTER_MODEL: z.string().min(1).default("anthropic/claude-sonnet-5"),
});

const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
  console.error("Invalid environment (see .env.example):");
  for (const issue of parsedEnv.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}
const env = parsedEnv.data;

const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });

export const reviewSchema = z.object({
  summary: z.string().describe("One-sentence overall verdict on the code"),
  issues: z.array(
    z.object({
      severity: z.enum(["critical", "major", "minor", "nit"]),
      description: z.string().describe("What is wrong and why it matters"),
      suggestion: z.string().describe("Concrete fix or improvement"),
    }),
  ),
});

export type Review = z.infer<typeof reviewSchema>;

export async function reviewCode(code: string): Promise<Review> {
  const { output } = await generateText({
    model: openrouter(env.OPENROUTER_MODEL),
    output: Output.object({ schema: reviewSchema }),
    instructions:
      "You are a strict but pragmatic senior code reviewer. " +
      "Report only issues worth fixing; do not pad the list.",
    prompt: `Review the following code:\n\n${code}`,
  });
  return output;
}

const sample = `
function getUserAge(users, id) {
  for (var i = 0; i <= users.length; i++) {
    if (users[i].id == id) return users[i].age;
  }
}
`;

console.log(`Reviewing sample snippet with ${env.OPENROUTER_MODEL}...\n`);
const review = await reviewCode(sample);
console.log(`Summary: ${review.summary}\n`);
for (const issue of review.issues) {
  console.log(`[${issue.severity}] ${issue.description}`);
  console.log(`  fix: ${issue.suggestion}`);
}
