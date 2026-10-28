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
  @('dispatch', 'Dispatch', 'Dispatch'),
  @('design', 'Design studio', 'Design studio'),
  @('runs', 'Runs', 'Runs'),
  @('results', 'Results and review', 'Results & review'),
  @('board', 'Task board', 'Task board'),
  @('teams', 'Teams', 'Teams'),
  @('agents', 'Agents', 'Agents'),
  @('reviews', 'Reviews', 'Reviews'),
  @('artifacts', 'Artifacts', 'Artifacts'),
  @('usage', 'Usage', 'Usage'),
  @('workflows', 'Workflows', 'Workflows'),
  @('plugins', 'Capabilities', 'Plugins'),
  @('settings', 'Advanced settings', 'Advanced settings')
)

$compact = @(
  @('dispatch', 'Dispatch', 'Dispatch'),
  @('design', 'Design studio', 'Design studio'),
  @('runs', 'Runs', 'Runs'),
  @('results', 'Results and review', 'Results & review'),
  @('board', 'Task board', 'Task board'),
  @('teams', 'Teams', 'Teams'),
  @('agents', 'Agents', 'Agents'),
  @('reviews', 'Reviews', 'Reviews'),
  @('artifacts', 'Artifacts', 'Artifacts'),
  @('usage', 'Usage', 'Usage'),
  @('workflows', 'Workflows', 'Workflows'),
  @('plugins', 'Capabilities', 'Plugins'),
  @('settings', 'Advanced settings', 'Advanced settings')
)

$screens = if ($Mode -eq 'compact') { $compact } else { $wide }
$first = $true

foreach ($screen in $screens) {
  $out = "$Prefix-$($screen[0]).png"
  $args = @('-ExecutionPolicy', 'Bypass', '-File', $capture, '-Out', $out, '-NavName', $screen[1], '-ExpectedTitle', $screen[2], '-WaitMs', '1000')
  if ($first) { $args += @('-Size', "${Width}x${Height}"); $first = $false }
  & powershell @args | Select-Object -Last 1
  if ($LASTEXITCODE -ne 0) { throw "capture failed for '$($screen[0])' at ${Width}px" }
}
