'Launcher am proxy (node server/proxy.js) trong nen, khong hien cua so.
'Duoc goi boi scheduled task "NewsSummarizerProxy" luc dang nhap Windows.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
sh.Run "node server\proxy.js", 0, False
