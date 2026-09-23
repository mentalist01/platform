param([int]$RecorderProcessId)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class RecorderForeground {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr handle, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
}
'@
while (Get-Process -Id $RecorderProcessId -ErrorAction SilentlyContinue) {
  $windowTitle = ''; $executable = ''
  try {
    $handle = [RecorderForeground]::GetForegroundWindow()
    [uint32]$windowProcessId = 0
    [void][RecorderForeground]::GetWindowThreadProcessId($handle, [ref]$windowProcessId)
    $windowProcess = Get-Process -Id $windowProcessId -ErrorAction Stop
    $processName = $windowProcess.ProcessName
    # Only LibreOffice and possible platform browsers are relevant. No titles
    # of unrelated apps are sent to the helper, logged, or stored.
    if ($processName -in @('soffice', 'soffice.bin', 'chrome', 'msedge', 'firefox', 'browser')) {
      $textBuffer = New-Object System.Text.StringBuilder 2048
      [void][RecorderForeground]::GetWindowText($handle, $textBuffer, $textBuffer.Capacity)
      $windowTitle = $textBuffer.ToString()
      $executable = [System.IO.Path]::GetFileName($windowProcess.Path)
    }
  } catch { }
  [Console]::WriteLine((@{ title=$windowTitle; exe=$executable } | ConvertTo-Json -Compress))
  Start-Sleep -Milliseconds 500
}
