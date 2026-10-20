# Capture the real Dispatch AI window from the running desktop.
#
# The React content renders on a DirectComposition surface, so PrintWindow returns only the
# XAML chrome (white). A screen-region copy of the window's own rectangle includes whatever
# the compositor actually put on screen, which is the pixels the user sees.
#
# The window is found by owning process rather than by title, because the WinUI window's
# title is not always the exact string Get-Process reports, and the window is raised to the
# top first: a screen copy of a covered rectangle would capture whatever else is on screen.
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class Cap {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  public static List<IntPtr> WindowsOf(uint target) {
    var found = new List<IntPtr>();
    EnumWindows((h, p) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid == target) found.Add(h);
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@

$out = $args[0]
$proc = Get-Process -Name "DispatchNative" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { Write-Output "NO_PROCESS"; exit 1 }
# The process's main window is the app frame. A WinUI app also owns smaller hidden helper
# windows, and picking the wrong one captures a fragment.
$hwnd = $proc.MainWindowHandle
[void][Cap]::ShowWindow($hwnd, 9)                      # SW_RESTORE
[void][Cap]::SetWindowPos($hwnd, [IntPtr](-1), 0, 0, 0, 0, 0x43)  # HWND_TOPMOST, NOMOVE|NOSIZE|SHOWWINDOW
[void][Cap]::BringWindowToTop($hwnd)
[void][Cap]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds 1500
$rect = New-Object Cap+RECT
[void][Cap]::GetWindowRect($hwnd, [ref]$rect)
$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top
Write-Output "WINDOW ${w}x${h} at $($rect.Left),$($rect.Top)"
if ($w -le 0 -or $h -le 0) { Write-Output "BAD_RECT"; exit 1 }
$bitmap = New-Object System.Drawing.Bitmap $w, $h
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size $w, $h))
$bitmap.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose(); $bitmap.Dispose()
[void][Cap]::SetWindowPos($hwnd, [IntPtr](-2), 0, 0, 0, 0, 0x43)  # HWND_NOTOPMOST
Write-Output "SAVED $out"
