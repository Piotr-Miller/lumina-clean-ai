**ASYNCHRONICZNY HYBRYDOWY EDYTOR FOTOGRAFII**

_From noise to perfection._

LuminaClean AI to aplikacja webowa przeznaczona dla fotografów. System pozwala na inteligentne usuwanie szumów cyfrowych (chrominancji i luminancji) oraz automatyczną rekonstrukcję i poprawę ekspozycji w ciemnych plikach graficznych (JPG/PNG).

Kluczowym założeniem inżynierskim projektu jest architektura hybrydowa (Dual-Engine Architecture). Użytkownik za pomocą dedykowanego przełącznika (wzorzec Strategy) może wybrać tryb przetwarzania:

- **AI Cloud Pipeline (Serverless GPU):** Bezkompromisowy potok ciężkich sieci neuronowych (model Bread na Replicate) operujący asynchronicznie w chmurze — podpisany upload → Database Webhook → Edge Function → predykcja z webhookiem zwrotnym → push wyniku przez Supabase Realtime, bez odświeżania strony. Uzupełniony o adaptacyjny post-pass odszumiania chrominancji w najciemniejszych partiach kadru.
- **Deterministic Client-Side Engine (Canvas API):** Natychmiastowe, darmowe przetwarzanie programistyczne (korekta gamma + rozmycie Gaussa) realizowane w 100% lokalnie na procesorze użytkownika, bez obciążania infrastruktury serwerowej i bez konieczności logowania.

Oba silniki są w pełni sterowalne — panel parametrów pozwala zacząć od wartości dobranych automatycznie (tryb Auto) albo ręcznie wyregulować jasność/gamma i siłę efektu, a suwak Przed / Po pokazuje różnicę na wyniku.

Dostęp do chmury jest bramkowany identyfikacją użytkownika (Supabase Auth + RLS), a koszty inferencji ogranicza globalny dobowy limit operacji Cloud AI (z awaryjnym kill-switchem). Dbamy o prywatność — pliki źródłowe są kasowane w ciągu 24 h. Aplikacja spełnia założenia kursu: rejestracja, logowanie, reset hasła oraz przechowywanie zleceń użytkownika.

**Stack:** Astro 6 (SSR) + React 19 + Tailwind 4 + shadcn/ui na froncie; Supabase (Auth, Postgres z RLS, Storage, Realtime, Edge Functions) jako backend; Replicate (model Bread) jako silnik AI; wdrożenie na Cloudflare Workers. Produkcyjnie dostępne pod adresem luminacleanai.com.

**Wkrótce:** obsługa formatów RAW i HEIC oraz lokalizacja interfejsu na kolejne języki (DE, PL, FR, ES, UKR, ZH).
