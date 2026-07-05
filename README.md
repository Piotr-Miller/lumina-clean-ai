# LuminaClean AI

Night and low-light photos taken on phones suffer from heavy digital noise and underexposure. Fixing them normally means moving the file to a desktop, installing paid editing software, and learning exposure/noise-reduction sliders — so most people just give up on the shot. LuminaClean AI removes that workflow entirely: upload a dark JPG, get a visibly cleaner, brighter version back in seconds, and compare the two with a before/after slider.

Two enhancement engines sit behind a Strategy toggle. The **Cloud AI** engine (the [Bread](https://replicate.com/) low-light model on Replicate) runs through an async pipeline — signed upload → database webhook → Supabase Edge Function → Replicate prediction → signed webhook callback → Supabase Realtime push to the browser, no page refresh needed. The **Local** engine is a free, no-account fallback that runs entirely on the visitor's device (Canvas API: gamma correction + Gaussian blur), with adaptive auto-parameters suggested from the image itself.

The cloud path is deliberately guarded: it requires a signed-in account (Supabase Auth + Row Level Security), a **global daily cap** on cloud operations bounds the Replicate bill (`CLOUD_DAILY_CAP`, `0` acts as a kill-switch), and uploaded source photos are private and deleted within 24 hours (inline on terminal job states, backstopped by an hourly pg_cron reaper). Full scope and explicit non-goals: [`idea-notes.md`](idea-notes.md); product requirements: [`context/foundation/prd.md`](context/foundation/prd.md).

Built as a 10xDevs course project, scaffolded from [10x-astro-starter](https://github.com/przeprogramowani/10x-astro-starter).

## Tech Stack

- [Astro](https://astro.build/) v6 - Modern web framework with server-first rendering
- [React](https://react.dev/) v19 - UI library for interactive components
- [TypeScript](https://www.typescriptlang.org/) v5 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - Utility-first CSS framework
- [Supabase](https://supabase.com/) - Auth, Postgres (with RLS), Storage, Edge Functions, Realtime
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime
- [Replicate](https://replicate.com/) - Hosted inference for the Bread low-light model
- [Vitest](https://vitest.dev/) + [Playwright](https://playwright.dev/) - Unit/integration and E2E tests

## Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)
- [Docker](https://www.docker.com/) for the local Supabase stack

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/Piotr-Miller/lumina-clean-ai.git
cd lumina-clean-ai
```

2. Install dependencies:

```bash
npm install
```

3. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

4. Create a `.dev.vars` file for local Cloudflare dev secrets:

```bash
cp .env.example .dev.vars
```

5. Run the development server:

```bash
npm run dev
```

The enhance UI lives on the home page (`/`) — the Local engine works anonymously; Cloud AI requires signing up.

## Available Scripts

- `npm run dev` - Start Astro dev server (Node/Vite; for workerd fidelity use `npm run build && npx wrangler dev`)
- `npm run build` - Build for production (SSR via `@astrojs/cloudflare`)
- `npm run preview` - Preview production build
- `npm run lint` / `npm run lint:fix` - ESLint with type-checked rules
- `npm run format` - Run Prettier
- `npm run typecheck` - `tsc --noEmit`
- `npm run test:unit` - Vitest unit suite (excludes the RLS integration suite)
- `npm run test` - Full Vitest suite incl. `tests/jobs.rls.test.ts` (needs the local Supabase stack)
- `npm run test:e2e` - Playwright E2E gate (production build on workerd; see `context/foundation/test-plan.md` §6.3 for the run recipe)
- `npm run test:mutation` - Stryker mutation testing on risk-critical modules (on demand, never in CI)

## Project Structure

```md
.
├── src/
│ ├── layouts/ # Astro layouts
│ ├── pages/ # Astro pages
│ │ └── api/ # API endpoints (auth, cloud job create/timeout)
│ ├── components/ # UI components (Astro & React)
│ ├── lib/ # Services, engines (local/cloud), helpers
│ └── middleware.ts # Session resolution + route protection
├── supabase/
│ ├── migrations/ # SQL migrations (jobs table, storage policies, cron)
│ └── functions/ # Edge Functions (enhance: /start + /callback)
├── tests/ # Vitest suites + Playwright E2E (tests/e2e/)
├── context/ # 10x written foundation (PRD, roadmap, test plan)
├── public/ # Public assets
├── wrangler.jsonc # Cloudflare Workers config
```

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for auth, the jobs database, photo storage, Edge Functions, and Realtime. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Start the local stack (downloads Docker images on first run and applies the migrations from `supabase/migrations/`):

```bash
npx supabase start
```

3. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

4. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`. To re-apply migrations from scratch, run `npx supabase db reset`.

### Using a cloud Supabase project instead

If you prefer to use a hosted Supabase project, add these variables to your `.env` and `.dev.vars` files:

| Variable       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard → Settings → API       |
| `SUPABASE_KEY` | `anon` public key from Supabase dashboard → Settings → API |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

Apply the migrations with `npx supabase db push` (they are **not** applied by CI deploy).

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this during local development:

1. Open the Supabase dashboard for your project
2. Go to **Authentication → Email → Confirm email**
3. Toggle it **off**

Users can then sign in immediately after sign-up without clicking a confirmation link.

### Auth routes

| Route                                           | Description                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| `/auth/signin`                                  | Email/password sign-in form                                             |
| `/auth/signup`                                  | Email/password sign-up form                                             |
| `/auth/confirm-email`                           | Post-signup "check your inbox" page                                     |
| `/auth/forgot-password`, `/auth/reset-password` | Password recovery flow                                                  |
| `/dashboard`                                    | Example protected page (redirects to `/auth/signin` if unauthenticated) |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/).

1. Build the project:

```bash
npm run build
```

2. Deploy with Wrangler:

```bash
npx wrangler deploy
```

Set `SUPABASE_URL` and `SUPABASE_KEY` as secrets in your Cloudflare dashboard or via `npx wrangler secret put`.

> **Production requires manual configuration that is not in this repo** — custom domain + DNS (Cloudflare), Supabase auth URLs + custom SMTP, Resend, and GitHub Actions secrets. The deployed Worker serves, but the **MVP** (accounts, auth email, branded domain) does not function from a clone alone. The full required setup is recorded in [`context/foundation/production-config.md`](context/foundation/production-config.md).

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs four jobs: **ci** (lint, unit tests, Edge Function `deno check`, SSR build), **integration** (full Vitest suite incl. the RLS tests against an ephemeral local Supabase in Docker), **e2e** (Playwright gate on the north-star cloud flow with a stubbed Replicate callback), and **deploy** (Worker + Edge Function, on pushes to `master` only, gated by the other three). `master` is PR-only.

## Documentation

The written foundation the app was built from lives in [`context/foundation/`](context/foundation/): [`prd.md`](context/foundation/prd.md) (vision, user stories, guardrails), [`roadmap.md`](context/foundation/roadmap.md), [`test-plan.md`](context/foundation/test-plan.md) (risk map + phased test rollout), and [`tech-stack.md`](context/foundation/tech-stack.md). MVP scope and non-goals: [`idea-notes.md`](idea-notes.md).

## License

MIT
