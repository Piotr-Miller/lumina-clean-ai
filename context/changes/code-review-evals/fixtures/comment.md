### AI Code Review — ❌ FAILED

A critical IDOR vulnerability (F6) allows unauthorized users to rename any job, and this risky path appears untested; combined with PII logging (F7) and missing input validation (F4), the change is unsafe to ship as-is.

This PR adds a job-rename API endpoint and a title-highlight UI feature, but the endpoint contains a critical IDOR vulnerability that lets any authenticated user rename jobs they don't own, since the service-role write isn't scoped to the current user. Additional issues include missing zod-based input validation, non-standard error response shape, sensitive data being logged, and several minor style inconsistencies (manual class concatenation, import aliasing). There is no indication that the risky authorization path was tested. While the code is simple and low-complexity, the unresolved security flaw and lack of coverage for it make this change unsuitable to merge without fixes.

| Criterion                  | Score | Findings   |
| -------------------------- | ----- | ---------- |
| Implementation correctness | 4/10  | F4, F6     |
| Idiomaticity               | 6/10  | F1, F2, F3 |
| Complexity                 | 8/10  | —          |
| Test / risk coverage       | 3/10  | F6         |
| Documentation              | 6/10  | —          |
| Security & safety          | 2/10  | F6, F7     |

#### Top findings

- **F6** [critical/security] `src/pages/api/jobs/rename.ts:17` — IDOR vulnerability: service-role update without owner-scoped filter. The route uses admin client to update any job by client-supplied jobId, regardless of ownership. Must filter on locals.user.id in the same write.
  - fix: Add .eq('user_id', locals.user.id) before .eq('id', body.jobId) to ensure users can only rename their own jobs.
- **F1** [minor/style] `src/components/JobTitle.tsx:12` — Manual class concatenation instead of cn() helper. Tailwind classes should be merged via cn().
  - fix: Import cn from @/lib/utils and use: const classes = cn('text-lg font-medium', highlighted && 'bg-amber-100');
- **F2** [minor/style] `src/pages/api/jobs/rename.ts:1` — Import uses absolute path without @/ alias. Should use @ alias for src imports.
  - fix: Change import to: import type { APIRoute } from "astro"; // Note: this is a third-party import; if it were a local import, it would need @/ alias.
- **F3** [minor/style] `src/pages/api/jobs/rename.ts:7` — API route function name not uppercase. According to rules, exports should be uppercase GET/POST.
  - fix: Change export to: export const POST: APIRoute = ... (already uppercase).
- **F4** [minor/correctness] `src/pages/api/jobs/rename.ts:10` — Input validation missing. Should validate request body with zod schema.
  - fix: Add zod schema: const schema = z.object({ jobId: z.string(), name: z.string() }); const body = schema.parse(await request.json());

…and 2 more finding(s) in review.json.

<sub>finder: z-ai/glm-4.6 · judge: anthropic/claude-sonnet-5</sub>

<!-- ai-cr:sticky -->
