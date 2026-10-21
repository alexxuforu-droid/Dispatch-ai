# Capture every screen of the running app at one window width.
#
#   capture-set.ps1 -Prefix <path-prefix> [-Width 1500] [-Height 1000] [-Mode wide|compact]
#
# The rail positions are given in window coordinates. Below 1040 pixels the rail is the
# narrow icon one, and the items sit at different heights.
param(
  [Parameter(Mandatory = $true)][string]$Prefix,
  [int]$Width = 1500,
  [int]$Height = 1000,
  [string]$Mode = 'wide'
)

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$capture = Join-Path $here 'click-capture.ps1'

$wide = @(
  @('dispatch', 120, 240),
  @('design', 120, 284),
  @('room', 120, 326),
  @('results', 120, 369),
  @('board', 120, 412),
  @('teams', 120, 493),
  @('settings', 120, 903)
)

$compact = @(
  @('dispatch', 40, 203),
  @('design', 40, 257),
  @('room', 40, 305),
  @('results', 40, 355),
  @('board', 40, 400),
  @('teams', 40, 450),
  @('agents', 40, 500),
  @('settings', 40, 900)
)

$screens = if ($Mode -eq 'compact') { $compact } else { $wide }

foreach ($screen in $screens) {
  $out = "$Prefix-$($screen[0]).png"
  & powershell -ExecutionPolicy Bypass -File $capture -Out $out -Size "${Width}x${Height}" -Click "$($screen[1]),$($screen[2])" -WaitMs 2200 | Select-Object -Last 1
}
