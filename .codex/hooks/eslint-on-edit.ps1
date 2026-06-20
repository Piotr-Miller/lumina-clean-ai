$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
$file = $payload.tool_input.file_path

if ($file -and $file -match '\.(ts|tsx|astro)$') {
  & npx.cmd eslint --fix -- $file --quiet
  exit $LASTEXITCODE
}

exit 0
