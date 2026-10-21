# Drive the real app: move the window, click a control, and capture what is on screen.
#
#   click-capture.ps1 -Out <png> [-Click x,y] [-Size WxH] [-Wheel <notches>]
#
# Coordinates are relative to the app window, so the script does not care where the
# window sits on the desktop.
param(
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Click = '',
  [string]$Size = '',
  [int]$Wheel = 0,
  [int]$WaitMs = 1400
)

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Driver {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
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
  [void][Driver]::SetWindowPos($hwnd, [IntPtr]::Zero, 40, 20, [int]$Matches[1], [int]$Matches[2], 0x0040)
  # The JavaScript side has to hear about the new size before the capture, or the picture
  # shows the layout from the old size.
  Start-Sleep -Milliseconds 4000
}

$rect = New-Object Driver+RECT
[void][Driver]::GetWindowRect($hwnd, [ref]$rect)

if ($Wheel -ne 0) {
  [void][Driver]::SetCursorPos($rect.Left + 40, $rect.Top + 400)
  $delta = if ($Wheel -gt 0) { 120 } else { -120 }
  [void][Driver]::mouse_event(0x0800, 0, 0, [uint32]($delta * [Math]::Abs($Wheel)), [IntPtr]::Zero)
  Start-Sleep -Milliseconds 700
}

if ($Click -match '^(\d+),(\d+)$') {
  # The coordinates are read off the capture, which is a copy of the window. A click at the
  # same window position therefore lands on the same pixel, so the position is used as it
  # is: the caption bar is part of the window, and the app's own surface sits below it on
  # both sides. Subtracting anything here lands the click on the row above the one asked
  # for, which is how every capture ended up showing the previous screen.
  $x = $rect.Left + [int]$Matches[1]
  $y = $rect.Top + [int]$Matches[2]
  [void][Driver]::SetCursorPos($x, $y)
  Start-Sleep -Milliseconds 250
  [void][Driver]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
  [void][Driver]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
  Start-Sleep -Milliseconds $WaitMs
}

[void][Driver]::GetWindowRect($hwnd, [ref]$rect)
$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top
$bitmap = New-Object System.Drawing.Bitmap $w, $h
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size $w, $h))
$bitmap.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose(); $bitmap.Dispose()
[void][Driver]::SetWindowPos($hwnd, [IntPtr](-2), 0, 0, 0, 0, 0x43)
Write-Output "SAVED $Out ${w}x${h}"
