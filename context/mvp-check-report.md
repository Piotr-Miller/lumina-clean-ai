# MVP Project Analysis Report — LuminaClean AI

> Generated 2026-07-05 against the criteria in `.claude/prompts/mvp-check.md`.
> English version first, Polish version below. / Wersja angielska na górze, polska poniżej.

---

## English

**Project shape:** Astro 6 SSR web app (React 19 islands) + Supabase (auth, Postgres/RLS, Storage, Edge Functions, Realtime) deployed to Cloudflare Workers. Domain: AI night-photo denoise/exposure correction with a cloud engine (Bread on Replicate) and a local Canvas fallback. The core persisted item is the **photo enhancement job** (`public.jobs` row + photo objects in the private `photos` bucket).

### 1. Checklist

#### ✅ 1. CRUD actions

All four operations exist for the core item (job + its photo objects) and act on persisted data:

- **Create** — `createPhotoJob()` in `src/lib/services/photo-job.service.ts:89` inserts a `queued` row into `public.jobs` and mints a one-shot signed upload URL; exposed via `POST /api/enhance/cloud/create-job` (`src/pages/api/enhance/cloud/create-job.ts` → `cloud-create-job.handler.ts`).
- **Read** — `getJobById()` (`photo-job.service.ts:213`); user-facing read in `src/components/hooks/useCloudJob.ts:232` (`.select("status, result_path, error_message, error_code")` + a Supabase Realtime subscription), gated by the RLS policy `jobs_select_own`.
- **Update** — guarded status transitions on persisted rows: `claimJobForProcessing()` (:233), `recordJobPrediction()` (:258), `markJobSucceeded()` (:181), `markJobFailed()` (:290), and the user-triggered `markPendingJobFailedForOwner()` (:328) reached via `POST /api/enhance/cloud/timeout`.
- **Delete** — `deleteJobSource()`/`deleteJobResult()` (:67/:72) on every terminal transition, owner-scoped `sweepStalePendingJobsForOwner()` (:376), and the scheduled global reaper `sweepAbandonedSourcesGlobally()` (:490) driven by pg_cron.

One honest caveat: there is no manual "delete my job" button — deletion is policy-driven (the ≤24h source-retention privacy guardrail), which is a deliberate design decision for this domain, and it genuinely removes persisted data.

#### ✅ 2. Business logic

Well beyond plain CRUD, and it is the product's unique value:

- **Local enhancement engine** — `src/lib/engines/local-engine.ts` (gamma correction + Gaussian blur on Canvas, with `canvas-helpers.ts` / `image-helpers.ts`).
- **Adaptive auto-parameters** — `src/lib/engines/auto-params.ts` analyzes the image and suggests enhancement parameters (the criterion's own "automatic suggestion" example, almost literally).
- **Global daily cost cap** — `countCloudJobsToday()` + `isOverDailyCap()` (`photo-job.service.ts:138/:160`): UTC-day, cross-user billable-job counting with a pre-model-failure exclusion rule and a `cap=0` kill-switch.
- **Webhook signature verification** — `src/lib/services/replicate-webhook.ts`.
- **Chroma denoise post-pass** — `src/lib/engines/chroma-denoise.ts`, behind a feature flag.

#### ✅ 3. Tests addressing a defined risk

`context/foundation/test-plan.md` §2 defines a 6-row Risk Map; named tests map directly to it:

- **Risk #2 (auth gate bypass)** → `tests/cloud-create-job.handler.test.ts:191` — describe block literally titled "anonymous auth gate (Risk #2)": anon request rejected 401 _before_ any insert or signed URL.
- **Risk #3 (daily cap fails to block)** → same file, :79 "global daily-cap route boundary": over-cap 429, last-slot-passes, `cap=0` kill-switch.
- **Risk #4 (IDOR)** → `tests/jobs.rls.test.ts:593` "cross-user IDOR (route boundary)": user B supplying user A's jobId flips nothing (:629).
- **Risk #5 (24h source retention)** → `tests/jobs.rls.test.ts:460` "sweepAbandonedSourcesGlobally (Risk #5 retention reaper, real storage)" — against real Supabase Storage, not mocks.
- **Risks #1/#6 (silent stall / watchdog)** → `tests/replicate-webhook.test.ts` (signature verifier) and Playwright E2E `tests/e2e/cloud-stall-surfaces-timeout.spec.ts` + `north-star-cloud-result.spec.ts`.

#### ✅ 4. Authentication tied to a user

- Supabase email+password auth: `src/pages/api/auth/{signin,signup,signout,reset-password,update-password}.ts`.
- `src/middleware.ts` resolves the session on every request into `locals.user` and redirects unauthenticated users off `PROTECTED_ROUTES`.
- Resources are owner-scoped in the database: RLS policies `jobs_select_own` / `jobs_insert_own` (`supabase/migrations/20260528120000_create_jobs_table.sql:86,93`) and `photos_{select,insert,update,delete}_own` on Storage (`20260528120100_create_photos_storage.sql`).
- The gate is enforced at the API, not just the UI (401 before side effects — see Risk #2 test), and client-supplied jobIds route through owner-scoped mutations (Risk #4 test).

#### ✅ 5. Documentation

The 10x written foundation is extensive: `context/foundation/prd.md` (vision, persona, success criteria, guardrails, user stories US-01+ with acceptance criteria), plus `roadmap.md`, `test-plan.md`, `tech-stack.md`, `shape-notes.md`, `infrastructure.md`, and root-level `idea-notes.md` (MVP scope + explicit non-goals). **Minor gap:** `README.md` is still the starter's ("10x Astro Starter") and never mentions LuminaClean AI — it covers setup/commands but not what _this_ product is; `idea-notes.md` currently fills that role. _(Closed 2026-07-05 — see Priority Improvements #1.)_

### 2. Project Status: **5/5 = 100%**

### 3. Priority Improvements

No criterion is unmet. Two polish items:

1. **Rewrite the README intro** — retitle to LuminaClean AI, add a 2–3 paragraph product description (or fold in `idea-notes.md`), and keep the starter's setup section below. This is the only place the "README explains what the project is" expectation is technically weak.
   > **✔ Implemented 2026-07-05** — `README.md` now opens with the LuminaClean AI title and a three-paragraph product description (problem, two engines behind the Strategy toggle, cloud guardrails), links to `idea-notes.md` / `context/foundation/prd.md`, and the stale starter content was fixed along the way (clone URL, the false "no migrations required" claim, scripts list, CI description).
2. _(Optional)_ A user-visible job history with manual delete would make the CRUD story airtight from a strict grader's perspective, though the retention-driven delete design is defensible as-is.

**Beyond the minimum (worth noting for Demo Day):** async cloud pipeline (signed upload → DB webhook → Edge Function → Replicate → signed callback → Realtime push), global cost cap with kill-switch, pg_cron retention reaper closing a privacy NFR, a 4-job CI (lint/unit, integration on ephemeral local Supabase, Playwright E2E on workerd with a stubbed Replicate, deploy), selective Stryker mutation testing as a quality gate, and Sentry observability with PII scrubbing. This is far past "solid technical foundations".

---

## Polski

**Charakter projektu:** aplikacja webowa Astro 6 SSR (wyspy React 19) + Supabase (auth, Postgres/RLS, Storage, Edge Functions, Realtime), wdrażana na Cloudflare Workers. Domena: odszumianie i korekcja ekspozycji zdjęć nocnych przez AI — silnik chmurowy (Bread na Replicate) i lokalny fallback na Canvas. Głównym trwałym bytem jest **zadanie przetwarzania zdjęcia (job)** — wiersz w `public.jobs` + obiekty zdjęć w prywatnym buckecie `photos`.

### 1. Checklista

#### ✅ 1. Operacje CRUD

Wszystkie cztery operacje istnieją dla głównego bytu i działają na trwałych danych:

- **Create** — `createPhotoJob()` w `src/lib/services/photo-job.service.ts:89` wstawia wiersz `queued` do `public.jobs` i generuje jednorazowy podpisany URL uploadu; dostępne przez `POST /api/enhance/cloud/create-job` (`src/pages/api/enhance/cloud/create-job.ts` → `cloud-create-job.handler.ts`).
- **Read** — `getJobById()` (`photo-job.service.ts:213`); odczyt po stronie użytkownika w `src/components/hooks/useCloudJob.ts:232` (select statusu/wyniku + subskrypcja Supabase Realtime), chroniony polityką RLS `jobs_select_own`.
- **Update** — strzeżone przejścia statusów na zapisanych wierszach: `claimJobForProcessing()` (:233), `recordJobPrediction()` (:258), `markJobSucceeded()` (:181), `markJobFailed()` (:290) oraz wyzwalane przez użytkownika `markPendingJobFailedForOwner()` (:328) przez `POST /api/enhance/cloud/timeout`.
- **Delete** — `deleteJobSource()`/`deleteJobResult()` (:67/:72) przy każdym przejściu terminalnym, sweep właścicielski `sweepStalePendingJobsForOwner()` (:376) oraz globalny, cykliczny reaper `sweepAbandonedSourcesGlobally()` (:490) uruchamiany przez pg_cron.

Uczciwa uwaga: nie ma ręcznego przycisku "usuń job" — kasowanie wynika z polityki retencji (guardrail prywatności: źródło ≤24h), co jest świadomą decyzją projektową i realnie usuwa trwałe dane.

#### ✅ 2. Logika biznesowa

Znacznie więcej niż CRUD — i to jest właśnie unikalna wartość produktu:

- **Lokalny silnik poprawy zdjęć** — `src/lib/engines/local-engine.ts` (korekcja gamma + rozmycie Gaussa na Canvas, z helperami `canvas-helpers.ts` / `image-helpers.ts`).
- **Adaptacyjne auto-parametry** — `src/lib/engines/auto-params.ts` analizuje obraz i sugeruje parametry przetwarzania (niemal dosłownie przykład "automatycznej sugestii" z kryterium).
- **Globalny dzienny limit kosztów** — `countCloudJobsToday()` + `isOverDailyCap()` (`photo-job.service.ts:138/:160`): zliczanie płatnych jobów w dniu UTC dla wszystkich użytkowników, z regułą wykluczania porażek sprzed modelu i kill-switchem `cap=0`.
- **Weryfikacja podpisu webhooka** — `src/lib/services/replicate-webhook.ts`.
- **Post-pass odszumiania chrominancji** — `src/lib/engines/chroma-denoise.ts` (za feature flagą).

#### ✅ 3. Testy adresujące zdefiniowane ryzyko

`context/foundation/test-plan.md` §2 zawiera mapę 6 ryzyk; konkretne testy mapują się wprost:

- **Ryzyko #2 (obejście bramki auth)** → `tests/cloud-create-job.handler.test.ts:191` — blok describe dosłownie nazwany "anonymous auth gate (Risk #2)": anonimowe żądanie odrzucone 401 _zanim_ nastąpi jakikolwiek insert czy podpisany URL.
- **Ryzyko #3 (limit dzienny nie blokuje)** → ten sam plik, :79 "global daily-cap route boundary": 429 ponad limitem, ostatni wolny slot przechodzi, kill-switch `cap=0`.
- **Ryzyko #4 (IDOR)** → `tests/jobs.rls.test.ts:593` "cross-user IDOR (route boundary)": użytkownik B z jobId użytkownika A niczego nie zmienia (:629).
- **Ryzyko #5 (retencja źródła ≤24h)** → `tests/jobs.rls.test.ts:460` "sweepAbandonedSourcesGlobally (Risk #5 retention reaper, real storage)" — na prawdziwym Supabase Storage, bez mocków.
- **Ryzyka #1/#6 (cichy stall / watchdog)** → `tests/replicate-webhook.test.ts` (weryfikator podpisu) oraz E2E Playwright `tests/e2e/cloud-stall-surfaces-timeout.spec.ts` i `north-star-cloud-result.spec.ts`.

#### ✅ 4. Uwierzytelnianie powiązane z użytkownikiem

- Supabase auth (email+hasło): `src/pages/api/auth/{signin,signup,signout,reset-password,update-password}.ts`.
- `src/middleware.ts` rozwiązuje sesję przy każdym żądaniu do `locals.user` i przekierowuje niezalogowanych z tras `PROTECTED_ROUTES`.
- Zasoby są przypisane do właściciela w bazie: polityki RLS `jobs_select_own` / `jobs_insert_own` (`supabase/migrations/20260528120000_create_jobs_table.sql:86,93`) oraz `photos_{select,insert,update,delete}_own` na Storage (`20260528120100_create_photos_storage.sql`).
- Bramka egzekwowana na poziomie API, nie tylko UI (401 przed efektami ubocznymi — test ryzyka #2), a jobId od klienta przechodzi przez mutacje ograniczone do właściciela (test ryzyka #4).

#### ✅ 5. Dokumentacja

Fundament pisany 10x jest rozbudowany: `context/foundation/prd.md` (wizja, persona, kryteria sukcesu, guardraile, historyjki US-01+ z kryteriami akceptacji), a obok `roadmap.md`, `test-plan.md`, `tech-stack.md`, `shape-notes.md`, `infrastructure.md` oraz `idea-notes.md` w korzeniu repo (zakres MVP + jawne non-goals). **Drobna luka:** `README.md` to wciąż README startera ("10x Astro Starter") i nigdzie nie wspomina LuminaClean AI — opisuje setup i komendy, ale nie sam produkt; tę rolę pełni obecnie `idea-notes.md`. _(Zamknięte 2026-07-05 — zob. Priorytetowe usprawnienia, pkt 1.)_

### 2. Status projektu: **5/5 = 100%**

### 3. Priorytetowe usprawnienia

Żadne kryterium nie jest niespełnione. Dwie rzeczy do doszlifowania:

1. **Przepisać wstęp README** — zmienić tytuł na LuminaClean AI, dodać 2–3 akapity opisu produktu (lub scalić `idea-notes.md`), a sekcję setupu startera zostawić niżej. To jedyne miejsce, gdzie oczekiwanie "README wyjaśnia, czym jest projekt" jest formalnie słabe.
   > **✔ Wdrożone 2026-07-05** — `README.md` otwiera się teraz tytułem LuminaClean AI i trzema akapitami opisu produktu (problem, dwa silniki za przełącznikiem Strategy, guardraile chmury), linkuje do `idea-notes.md` / `context/foundation/prd.md`, a przy okazji poprawiono nieaktualne treści startera (URL klonowania, fałszywe "no migrations required", listę skryptów, opis CI).
2. _(Opcjonalnie)_ Widoczna dla użytkownika historia jobów z ręcznym usuwaniem domknęłaby CRUD z perspektywy najbardziej rygorystycznego oceniającego — choć obecny, retencyjny model kasowania jest w tej domenie w pełni obronny.

**Ponad minimum (warte wzmianki pod Demo Day):** asynchroniczny pipeline chmurowy (podpisany upload → DB webhook → Edge Function → Replicate → podpisany callback → push Realtime), globalny limit kosztów z kill-switchem, reaper retencji na pg_cron domykający NFR prywatności, CI z 4 jobami (lint/unit, integracja na efemerycznym lokalnym Supabase, E2E Playwright na workerd ze stubem Replicate, deploy), selektywne testy mutacyjne Stryker jako brama jakości oraz observability Sentry ze scrubbingiem PII. To wyraźnie więcej niż "solidne fundamenty techniczne".
