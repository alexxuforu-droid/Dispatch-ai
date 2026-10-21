# Crop a strip out of a screenshot and enlarge it, so a small artefact can be read.
param(
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$X = 860,
  [int]$Y = 30,
  [int]$W = 40,
  [int]$H = 400,
  [int]$Scale = 4
)
Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Bitmap]::new($In)
$crop = [System.Drawing.Bitmap]::new($W, $H)
$graphics = [System.Drawing.Graphics]::FromImage($crop)
$graphics.DrawImage($source, (New-Object System.Drawing.Rectangle(0, 0, $W, $H)), (New-Object System.Drawing.Rectangle($X, $Y, $W, $H)), [System.Drawing.GraphicsUnit]::Pixel)
$graphics.Dispose()
$big = [System.Drawing.Bitmap]::new(($W * $Scale), ($H * $Scale))
$bigGraphics = [System.Drawing.Graphics]::FromImage($big)
$bigGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$bigGraphics.DrawImage($crop, 0, 0, ($W * $Scale), ($H * $Scale))
$bigGraphics.Dispose()
$big.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$big.Dispose()
$crop.Dispose()
$source.Dispose()
Write-Output "SAVED $Out"
