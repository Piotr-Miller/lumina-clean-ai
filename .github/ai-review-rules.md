# LuminaClean AI — project review rules (AI code review)

Trusted context for the AI PR reviewer's finder pass. The workflow sources
this file from the BASE branch (never the PR head) and passes it via
`--project-context-file`; the package caps it at 10,000 chars. Keep it a
curated distillation of AGENTS.md — not a copy.

## Hard rules (violations are findings)

- **RLS**: every new Supabase table enables Row Level Security with granular
  per-operation, per-role policies. New-table migrations must also
  `revoke all ... from anon, authenticated` and re-grant only the minimum
  (never revoke from `service_role` — admin code paths need its grants).
- **IDOR**: any route that accepts a client-supplied resource id and mutates
  through a service-role (RLS-bypassing) client must use an owner-scoped
  helper that filters on the session `user_id` in the same write. Id-only
  service-role mutations from user-facing routes are findings.
- **API routes**: export `const prerender = false`; uppercase `GET`/`POST`
  exports; validate input with zod; errors return
  `{ error: { code, message } }` (snake_case `code`, HTTP 400 validation /
  500 unexpected, no `status` in the body).
- **Secrets**: never in code, logs, or committed env files. Watch for keys,
  tokens, or signing secrets embedded in diffs and for `console.log` of
  sensitive payloads.
- **Tailwind**: conditional/merged class names go through the `cn()` helper
  from `@/lib/utils` — never manual string concatenation.
- **Imports**: use the `@/*` alias for `./src/*`.
- **React 19**: no Next.js directives ("use client" etc.); hooks extracted to
  `src/components/hooks/`; form submit handlers type events as
  `React.SubmitEvent` (NOT the deprecated `React.FormEvent`).
- **Shared types**: entities and DTOs live in `src/types.ts`.
- **Supabase migrations**: `YYYYMMDDHHmmss_short_description.sql` under
  `supabase/migrations/`; tables broadcasting RLS-scoped UPDATE/DELETE via
  Realtime need `replica identity full`.

## Testing bar

- Risk-weighted coverage, not "vibe tests": meaningful behaviors and risky
  paths deserve tests proportional to their risk; tests that pin
  implementation detail without protecting user-visible behavior are a
  negative signal.
- Deno Edge Functions (`supabase/functions/**`) are outside the root
  tsc/eslint graphs — changes there should keep `deno check` green.

## Repo-specific red flags

- New tables without explicit grants (fresh Supabase CLI stacks no longer
  seed blanket `service_role` grants — migrations must GRANT explicitly).
- Async fire-and-forget handoffs (DB webhooks, pg_net) without a timeout
  backstop covering every non-terminal state.
- Client timeouts or signed-URL TTLs sized to warm latency instead of the
  external model's cold-boot ceiling.
- `E2E_ALLOWED_OUTPUT_ORIGIN` is a local/CI-only stub seam — any change
  setting it in production config is a critical finding.
