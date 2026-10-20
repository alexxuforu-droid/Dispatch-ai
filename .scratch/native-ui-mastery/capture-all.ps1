# Capture every visible window the app owns, so a separate error dialog is not missed.
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class Cap {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  public static List<IntPtr> WindowsOf(uint target) {
    var found = new List<IntPtr>();
    EnumWindows((h, p) => { uint pid; GetWindowThreadProcessId(h, out pid); if (pid == target) found.Add(h); return true; }, IntPtr.Zero);
    return found;
  }
}
"@

$prefix = $args[0]
$proc = Get-Process -Name "DispatchNative" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $proc) { Write-Output "NO_PROCESS"; exit 1 }
$index = 0
foreach ($h in [Cap]::WindowsOf([uint32]$proc.Id)) {
  if (-not [Cap]::IsWindowVisible($h)) { continue }
  $title = New-Object System.Text.StringBuilder 256
  [void][Cap]::GetWindowText($h, $title, 256)
  $rect = New-Object Cap+RECT
  [void][Cap]::GetWindowRect($h, [ref]$rect)
  $w = $rect.Right - $rect.Left
  $ht = $rect.Bottom - $rect.Top
  if ($w -le 0 -or $ht -le 0) { continue }
  [void][Cap]::ShowWindow($h, 9)
  [void][Cap]::SetWindowPos($h, [IntPtr](-1), 0, 0, 0, 0, 0x43)
  [void][Cap]::BringWindowToTop($h)
  [void][Cap]::SetForegroundWindow($h)
  Start-Sleep -Milliseconds 900
  $out = "$prefix-$index.png"
  $bitmap = New-Object System.Drawing.Bitmap $w, $ht
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size $w, $ht))
  $bitmap.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose(); $bitmap.Dispose()
  [void][Cap]::SetWindowPos($h, [IntPtr](-2), 0, 0, 0, 0, 0x43)
  Write-Output "SAVED $out  ${w}x${ht} title='$($title.ToString())'"
  $index += 1
}
