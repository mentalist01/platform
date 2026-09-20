Option Explicit
Dim shell, fso, folder, http, running, result
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
running = False
On Error Resume Next
Set http = CreateObject("MSXML2.XMLHTTP")
http.open "GET", "http://127.0.0.1:18765/", False
http.send
running = (http.status = 200)
On Error GoTo 0
If running Then WScript.Quit 0
shell.CurrentDirectory = folder
result = shell.Run(Chr(34) & folder & "\node.exe" & Chr(34) & " " & Chr(34) & folder & "\app.mjs" & Chr(34), 0, True)
WScript.Quit result
