// Capture the real Dispatch AI window from the running desktop.
//
// The React content renders on a DirectComposition surface, so PrintWindow returns only the
// XAML chrome (white). A screen-region copy of the window's own rectangle includes whatever
// the compositor actually put on screen, which is the pixels the user sees.
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Cap {
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr FindWindow(string c, string n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$out = $args[0]
$hwnd = [Cap]::FindWindow($null, "Dispatch AI")
if ($hwnd -eq [IntPtr]::Zero) { Write-Output "NO_WINDOW"; exit 1 }
[void][Cap]::ShowWindow($hwnd, 9)   # SW_RESTORE
[void][Cap]::SetForegroundWindow($hwnd)
Start-Sleep -Milliseconds 700
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
Write-Output "SAVED $out"
