# Wrangler authentication on this machine

This project deploys to Cloudflare Workers/Pages via `wrangler`. On corporate / domain-joined Windows machines, `wrangler login` (OAuth) often hangs even after the browser shows "Authorization granted to Wrangler". This document records the symptom, the root cause, and the working procedure.

## Symptom

1. Run `npx wrangler login` in PowerShell (or Git Bash).
2. Browser opens, you approve, and the page shows **"Authorization granted to Wrangler. You can close this window."**
3. Terminal sits forever waiting; `npx wrangler whoami` in a new terminal reports not authorized.

## Root cause

Wrangler runs a temporary local HTTP server on `http://localhost:8976/oauth/callback` to receive the OAuth redirect. On this machine the redirect never reaches that server because:

- The **Domain** firewall profile is enabled and set to **Block inbound** (corporate policy).
- Adding an explicit `New-NetFirewallRule` allowing inbound TCP for `node.exe` does NOT fix it — something beyond Windows Firewall (most likely an EDR agent or corporate security tool) intercepts the loopback callback.

Diagnostic commands (read-only) that confirmed this:

```powershell
# Is anything listening on the OAuth callback port?
try { Get-NetTCPConnection -LocalPort 8976 -ErrorAction Stop } catch { "Port 8976: nothing listening" }

# Which firewall profiles are active and what's their inbound posture?
Get-NetFirewallProfile | Select-Object Name, Enabled, DefaultInboundAction

# Are proxy env vars or stale wrangler creds interfering?
'HTTP_PROXY','HTTPS_PROXY','CLOUDFLARE_API_TOKEN','WRANGLER_HOME' | ForEach-Object {
  "$_=$([System.Environment]::GetEnvironmentVariable($_))"
}

# Does a previous wrangler login persist anywhere?
Test-Path "$env:USERPROFILE\.wrangler\config\default.toml"
```

## Working procedure: API token (use this)

This is also the posture called for in `CLAUDE.md` — "Tokens are scoped, not master keys."

### 1. Create a scoped API token

1. Open <https://dash.cloudflare.com/profile/api-tokens>
2. **Create Token** → pick the **"Edit Cloudflare Workers"** template.
3. On the summary page, click **Edit token** and add **Account → Cloudflare Pages → Edit** (LuminaClean deploys to Pages too).
4. **Create Token** → copy it once. You cannot view it again.

### 2. Set the token in PowerShell

**Per-user, persistent (recommended):**

```powershell
[System.Environment]::SetEnvironmentVariable("CLOUDFLARE_API_TOKEN","paste-token-here","User")
# Close and reopen PowerShell for the variable to be picked up.
```

**Or per-project via `.dev.vars`** (already gitignored, used by Wrangler's local dev runtime):

```dotenv
CLOUDFLARE_API_TOKEN=paste-token-here
```

### 3. Verify

```powershell
npx wrangler whoami
```

Should print your email, account ID, and the token's permissions. If it does, you're done — `wrangler deploy`, `wrangler pages deploy`, etc. all use the same env var automatically.

## What did NOT work on this machine

For posterity — do not repeat these:

- `npx wrangler login` in PowerShell ran as administrator. Same hang.
- `npx wrangler login` in Git Bash. Same hang.
- Inbound firewall rule for `node.exe` on all profiles:

  ```powershell
  New-NetFirewallRule -DisplayName 'Wrangler OAuth Loopback (node.exe)' `
    -Direction Inbound -Program 'C:\Program Files\nodejs\node.exe' `
    -Protocol TCP -Action Allow -Profile Any
  ```

  Rule was created and active, but the callback still never landed. The rule was left in place (harmless) but did not unblock OAuth.

## When OAuth might work later

If you move off the corporate-managed machine, or the EDR/security agent is removed, OAuth should work again. The API token path keeps working regardless, so there is no reason to switch back.

## Pages → Workers command mapping

LuminaClean ships as a **Worker** (see `name: "lumina-clean-ai"` in `wrangler.jsonc`), not a Pages project. Most tutorials show Pages commands; here are the Workers equivalents.

| Pages command | Workers equivalent |
| --- | --- |
| `wrangler pages deployment list --project-name <p>` | `wrangler deployments list --name lumina-clean-ai` |
| `wrangler pages deployment tail --project-name <p>` | `wrangler tail lumina-clean-ai` *(or `wrangler tail --name lumina-clean-ai`)* |
| `wrangler pages secret list --project-name <p>` | `wrangler secret list --name lumina-clean-ai` |

Key differences:

- **`--project-name`** (Pages) → **`--name`** (Workers).
- **`wrangler pages deployment ...`** (singular, namespaced) → **`wrangler deployments ...`** (plural, top-level) for Workers.
- **`wrangler pages deployment tail`** → just **`wrangler tail`** for Workers.
- Run any of these from the project root (where `wrangler.jsonc` lives) and you can omit `--name` entirely — wrangler reads the name from config:

  ```powershell
  npx wrangler deployments list
  npx wrangler tail
  npx wrangler secret list
  ```

### Other Workers commands you'll want

```powershell
npx wrangler secret put SUPABASE_KEY          # add/update a secret (prompts for value)
npx wrangler secret delete SUPABASE_KEY       # remove a secret
npx wrangler deployments view <deployment-id> # inspect a specific deployment
npx wrangler rollback <deployment-id>         # roll back to a previous deployment
npx wrangler versions list                    # gradual rollouts (Workers-only, no Pages equivalent)
npx wrangler versions deploy
```
