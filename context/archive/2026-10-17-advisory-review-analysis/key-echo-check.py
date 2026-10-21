import os, subprocess, sys
secret = "QZJX7W4KQZJX7W4K"
bad = 0
for script in ("scripts/prod-fetch-results.py", "scripts/prod-result-dimensions.py"):
    for key, expect in ((f"<sb_secret_{secret}>", "still contains a placeholder"), ("", "is not set")):
        env = {**os.environ, "SUPABASE_SERVICE_ROLE_KEY": key, "SUPABASE_URL": "https://example.invalid"}
        p = subprocess.run([sys.executable, "-I", script], env=env, capture_output=True, text=True, timeout=30)
        out = p.stdout + p.stderr
        leaks = sorted({secret[i:i + 4] for i in range(len(secret) - 3) if secret[i:i + 4] in out})
        ok = p.returncode == 1 and expect in out and not leaks
        print(f"{script} key={'placeholder' if key else 'empty'}: exit {p.returncode}, leaked: {leaks or 'none'} -> {'ok' if ok else 'FAIL'}")
        bad += not ok
sys.exit(1 if bad else 0)
