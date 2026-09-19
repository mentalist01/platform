$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$widgetMutex = New-Object System.Threading.Mutex($false, 'Local\Ivan100RecorderHotkeys')
if (-not $widgetMutex.WaitOne(0)) { exit }
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;
public class RecorderHotkeyWindow : Form {
  [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr h, int id, uint modifiers, uint key);
  [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr h, int id);
  public event Action<int> KeyPressed;
  protected override void OnHandleCreated(EventArgs e) {
    base.OnHandleCreated(e);
    for (int i=1;i<=4;i++) RegisterHotKey(Handle,i,0x4003,(uint)(0x30+i));
  }
  protected override void WndProc(ref Message m) {
    if(m.Msg==0x0312 && KeyPressed!=null) KeyPressed(m.WParam.ToInt32());
    base.WndProc(ref m);
  }
  protected override void OnFormClosed(FormClosedEventArgs e) {
    for(int i=1;i<=4;i++) UnregisterHotKey(Handle,i);
    base.OnFormClosed(e);
  }
}
'@
$form = New-Object RecorderHotkeyWindow
$form.Text = 'IVAN100'
$form.Size = New-Object System.Drawing.Size(310,100)
$form.FormBorderStyle = 'FixedToolWindow'
$form.TopMost = $true
$form.StartPosition = 'Manual'
$form.Location = New-Object System.Drawing.Point(20,20)
$form.BackColor = [System.Drawing.Color]::FromArgb(23,30,45)
$names = @('Платформа','Программа','Экран','Перерыв')
$modes = @('platform','window','screen','pause')
$sendScene = {
  param([int]$index)
  try {
    $panelHtml = (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:18765/' -TimeoutSec 3).Content
    $panelKey = [regex]::Match($panelHtml, "const key='([^']+)'").Groups[1].Value
    Invoke-RestMethod 'http://127.0.0.1:18765/scene' -Method Post -Headers @{'X-Recorder-Key'=$panelKey} -ContentType 'application/json' -Body (@{mode=$modes[$index]} | ConvertTo-Json) | Out-Null
    $form.Text = 'IVAN100: ' + $names[$index]
  } catch { $form.Text = 'Откройте пульт: ошибка OBS' }
}
for($i=0;$i -lt 4;$i++) {
  $button = New-Object System.Windows.Forms.Button
  $button.Text = "$($i+1) $($names[$i])"
  $button.Tag = $i
  $button.Size = New-Object System.Drawing.Size(72,45)
  $button.Location = New-Object System.Drawing.Point((4+73*$i),7)
  $button.ForeColor = [System.Drawing.Color]::White
  $button.Add_Click({ & $sendScene ([int]$this.Tag) })
  $form.Controls.Add($button)
}
$form.add_KeyPressed({ param($id) & $sendScene ($id-1) })
[System.Windows.Forms.Application]::Run($form)
$widgetMutex.ReleaseMutex()
$widgetMutex.Dispose()
