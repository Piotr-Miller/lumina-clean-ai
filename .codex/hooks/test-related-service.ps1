$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
$file = $payload.tool_input.file_path
$normalized = $file -replace '\\', '/'

if ($file -and $normalized -match '/src/lib/services/.*\.tsx?$') {
  & npx.cmd vitest related $file --run --exclude '**/jobs.rls.test.ts'
  if ($LASTEXITCODE -ne 0) {
    exit 2
  }
}

exit 0
