# Drive the real app: move the window, click a control, and capture what is on screen.
#
#   click-capture.ps1 -Out <png> [-Click x,y] [-Size WxH] [-Wheel <notches>]
#
# Coordinates are relative to the app window, so the script does not care where the
# window sits on the desktop.
param(
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Click = '',
  [string]$NavName = '',
  [string]$Hover = '',
  [string]$Size = '',
  [string]$ExpectedTitle = '',
  [int]$Wheel = 0,
  [int]$WaitMs = 1400
)

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Driver {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attribute, out RECT r, int size);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, IntPtr extra);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$proc = Get-Process -Name 'DispatchNative' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { Write-Output 'NO_PROCESS'; exit 1 }
$hwnd = $proc.MainWindowHandle

[void][Driver]::ShowWindow($hwnd, 9)
[void][Driver]::SetWindowPos($hwnd, [IntPtr](-1), 0, 0, 0, 0, 0x43)
[void][Driver]::BringWindowToTop($hwnd)
[void][Driver]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds 600

if ($Size -match '^(\d+)x(\d+)$') {
   [void][Driver]::SetWindowPos($hwnd, [IntPtr]::Zero, 0, 0, [int]$Matches[1], [int]$Matches[2], 0x0040)
  # The JavaScript side has to hear about the new size before the capture, or the picture
  # shows the layout from the old size.
  Start-Sleep -Milliseconds 4000
}

$rect = New-Object Driver+RECT
[void][Driver]::GetWindowRect($hwnd, [ref]$rect)
$frame = New-Object Driver+RECT
$frameResult = [Driver]::DwmGetWindowAttribute($hwnd, 9, [ref]$frame, [Runtime.InteropServices.Marshal]::SizeOf([type][Driver+RECT]))
if ($frameResult -ne 0 -or $frame.Right -le $frame.Left -or $frame.Bottom -le $frame.Top) { $frame = $rect }

if ($Wheel -ne 0) {
  [void][Driver]::SetCursorPos($frame.Left + 40, $frame.Top + 400)
  $delta = if ($Wheel -gt 0) { 120 } else { -120 }
  [void][Driver]::mouse_event(0x0800, 0, 0, [uint32]($delta * [Math]::Abs($Wheel)), [IntPtr]::Zero)
  Start-Sleep -Milliseconds 700
}

if ($Hover -match '^(\d+),(\d+)$') {
  # The pointer is put on a control and left there, so the capture shows the hover state.
  [void][Driver]::SetCursorPos($frame.Left + [int]$Matches[1], $frame.Top + [int]$Matches[2])
  Start-Sleep -Milliseconds $WaitMs
}

if ($NavName) {
  Add-Type -AssemblyName UIAutomationClient
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
  $elements = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  $target = $null
  for ($i = 0; $i -lt $elements.Count; $i++) {
    $element = $elements.Item($i)
    if ($element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and $element.Current.Name -eq $NavName) { $target = $element; break }
  }
  if (-not $target) { Write-Output "NO_NAV_BUTTON '$NavName'"; [void][Driver]::SetWindowPos($hwnd, [IntPtr](-2), 0, 0, 0, 0, 0x43); exit 2 }
  for ($i = 0; $i -lt $elements.Count; $i++) {
    $element = $elements.Item($i)
    if ($element.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and $element.Current.Name -eq 'Dispatch') {
      try { $element.GetCurrentPattern([System.Windows.Automation.ScrollItemPattern]::Pattern).ScrollIntoView() } catch { }
      break
    }
  }
  try { $target.GetCurrentPattern([System.Windows.Automation.ScrollItemPattern]::Pattern).ScrollIntoView() } catch { }
  Start-Sleep -Milliseconds 250
  $bounds = $target.Current.BoundingRectangle
  if ($bounds.Width -le 0 -or $bounds.Height -le 0) { Write-Output "NO_NAV_BOUNDS '$NavName'"; [void][Driver]::SetWindowPos($hwnd, [IntPtr](-2), 0, 0, 0, 0, 0x43); exit 2 }
  [void][Driver]::SetCursorPos([int]($bounds.X + $bounds.Width / 2), [int]($bounds.Y + $bounds.Height / 2))
  Start-Sleep -Milliseconds 100
  [void][Driver]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
  [void][Driver]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
  Start-Sleep -Milliseconds $WaitMs
} elseif ($Click -match '^(\d+),(\d+)$') {
  # The coordinates are read off the capture, which is a copy of the window. A click at the
  # same window position therefore lands on the same pixel, so the position is used as it
  # is: the caption bar is part of the window, and the app's own surface sits below it on
  # both sides. Subtracting anything here lands the click on the row above the one asked
  # for, which is how every capture ended up showing the previous screen.
  $x = $frame.Left + [int]$Matches[1]
  $y = $frame.Top + [int]$Matches[2]
  [void][Driver]::SetCursorPos($x, $y)
  Start-Sleep -Milliseconds 250
  [void][Driver]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
  [void][Driver]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
  Start-Sleep -Milliseconds $WaitMs
}

if ($ExpectedTitle) {
  Add-Type -AssemblyName UIAutomationClient
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
  $elements = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  $names = for ($i = 0; $i -lt $elements.Count; $i++) { $name = $elements.Item($i).Current.Name; if ($name) { $name } }
  if ($names -notcontains $ExpectedTitle) {
    Write-Output "TITLE_MISMATCH expected='$ExpectedTitle' actual='$($names -join ' | ')'"
    [void][Driver]::SetWindowPos($hwnd, [IntPtr](-2), 0, 0, 0, 0, 0x43)
    exit 2
  }
  Write-Output "TITLE_OK '$ExpectedTitle'"
}

[void][Driver]::GetWindowRect($hwnd, [ref]$rect)
$frameResult = [Driver]::DwmGetWindowAttribute($hwnd, 9, [ref]$frame, [Runtime.InteropServices.Marshal]::SizeOf([type][Driver+RECT]))
if ($frameResult -ne 0 -or $frame.Right -le $frame.Left -or $frame.Bottom -le $frame.Top) { $frame = $rect }
$w = $frame.Right - $frame.Left
$h = $frame.Bottom - $frame.Top
$bitmap = New-Object System.Drawing.Bitmap $w, $h
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($frame.Left, $frame.Top, 0, 0, (New-Object System.Drawing.Size $w, $h))
$bitmap.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose(); $bitmap.Dispose()
[void][Driver]::SetWindowPos($hwnd, [IntPtr](-2), 0, 0, 0, 0, 0x43)
Write-Output "SAVED $Out ${w}x${h} outer=$($rect.Right - $rect.Left)x$($rect.Bottom - $rect.Top)"
