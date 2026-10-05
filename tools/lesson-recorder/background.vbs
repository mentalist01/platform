Option Explicit
Dim shell, fso, folder, result
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = folder
result = shell.Run(Chr(34) & folder & "\node.exe" & Chr(34) & " " & Chr(34) & folder & "\watchdog.mjs" & Chr(34), 0, True)
WScript.Quit result
