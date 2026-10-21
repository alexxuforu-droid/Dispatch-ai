# Measure the rule the app is held to: the chrome is neutral and the colour is content.
#
# For each screenshot this reports the share of the pixels that are neutral (the chrome),
# the share that carry a hue, and where the colour sits. A screen where the colour is
# spread over the chrome scores badly here, and a screen where one block carries it
# scores well.
param(
  [Parameter(Mandatory = $true)][string]$Folder,
  [string]$Filter = '*.png'
)
Add-Type -AssemblyName System.Drawing

foreach ($file in Get-ChildItem $Folder -Filter $Filter | Sort-Object Name) {
  $bitmap = [System.Drawing.Bitmap]::new($file.FullName)
  $width = $bitmap.Width
  $height = $bitmap.Height
  $step = [Math]::Max(1, [int]($width / 240))
  $total = 0
  $neutral = 0
  $light = 0
  $hues = @{}
  $minX = 0; $maxX = 0; $minY = 0; $maxY = 0; $colourPixels = 0
  for ($y = 0; $y -lt $height; $y += $step) {
    for ($x = 0; $x -lt $width; $x += $step) {
      $pixel = $bitmap.GetPixel($x, $y)
      $total++
      $spread = [Math]::Max($pixel.R, [Math]::Max($pixel.G, $pixel.B)) - [Math]::Min($pixel.R, [Math]::Min($pixel.G, $pixel.B))
      $luminance = 0.2126 * $pixel.R + 0.7152 * $pixel.G + 0.0722 * $pixel.B
      if ($spread -lt 24) {
        if ($luminance -gt 190) { $light++ } else { $neutral++ }
        continue
      }
      $key = '{0:X2}{1:X2}{2:X2}' -f $pixel.R, $pixel.G, $pixel.B
      if (-not $hues.ContainsKey($key)) { $hues[$key] = @{ count = 0; x = $x; y = $y } }
      $hues[$key].count++
      if ($colourPixels -eq 0) { $minX = $x; $maxX = $x; $minY = $y; $maxY = $y }
      $colourPixels++
      if ($x -lt $minX) { $minX = $x }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
  $bitmap.Dispose()
  $top = $hues.GetEnumerator() | Sort-Object -Property Value.count -Descending | Select-Object -First 3
  $topText = ($top | ForEach-Object { "#$($_.Key) $([Math]::Round(100 * $_.Value.count / $total, 1))%" }) -join '  '
  Write-Output ("{0,-26} neutral {1,5}%  light {2,5}%  colour {3,5}%  distinct hues {4,3}  box {5}x{6} at {7},{8}  top: {9}" -f `
    $file.Name, [Math]::Round(100 * $neutral / $total, 1), [Math]::Round(100 * $light / $total, 1), [Math]::Round(100 * $colourPixels / $total, 1), $hues.Count, ($maxX - $minX), ($maxY - $minY), $minX, $minY, $topText)
}
