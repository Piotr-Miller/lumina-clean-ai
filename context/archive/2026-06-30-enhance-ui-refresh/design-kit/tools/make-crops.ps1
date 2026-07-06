# Generate text-free crops of the LCAI key visual for the direction boards.
# Marketing copy sits at: logo/wordmark x25-410 y210-300, headline x30-340 y370-450,
# icons x20-320 y610-700, BEFORE/AFTER labels x490-690 y920-945. Crops avoid all of it.
Add-Type -AssemblyName System.Drawing

$src = Join-Path $PSScriptRoot "..\assets\LCAI.jpg"
$outDir = Join-Path $PSScriptRoot "..\assets\derived"
New-Item -ItemType Directory -Force $outDir | Out-Null

$img = [System.Drawing.Image]::FromFile((Resolve-Path $src))

function Save-Crop($x, $y, $w, $h, $outW, $outH, $quality, $name) {
  $bmp = New-Object System.Drawing.Bitmap($outW, $outH)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $srcRect = New-Object System.Drawing.Rectangle($x, $y, $w, $h)
  $dstRect = New-Object System.Drawing.Rectangle(0, 0, $outW, $outH)
  $g.DrawImage($img, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()

  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
  $params = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$quality)
  $outPath = Join-Path $outDir $name
  $bmp.Save($outPath, $codec, $params)
  $bmp.Dispose()
  $kb = [math]::Round((Get-Item $outPath).Length / 1KB, 1)
  Write-Output "$name : ${outW}x${outH} q$quality -> ${kb} KB"
}

# Beam backdrop: divider beam + both city halves, no marketing text (x>=420, y<=900)
Save-Crop 420 0 600 900 440 660 62 "backdrop-beam.jpg"
# Crisp right-side street: the 'demo photo' inside board mocks
Save-Crop 600 60 420 760 360 651 65 "city-after.jpg"
# Full key visual downscaled: idle-state marketing banner demo
Save-Crop 0 0 1024 1024 560 560 65 "banner-full.jpg"

$img.Dispose()
