' Super LTC silent updater launcher.
'
' Why this exists: Windows Task Scheduler running powershell.exe directly
' flashes a console window in interactive sessions, even with
' -WindowStyle Hidden — the hidden flag is applied AFTER the conhost
' process starts. wscript.exe creates no console host of its own, so
' spawning powershell.exe from VBS with WindowStyle=0 hides it cleanly.
'
' This script is run by the scheduled task. It in turn runs the real
' update-super-ltc-silent.ps1 in the same folder as this file.

Dim shell, scriptDir, ps1Path
Set shell = CreateObject("WScript.Shell")

scriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
ps1Path = scriptDir & "update-super-ltc-silent.ps1"

shell.Run "powershell.exe -ExecutionPolicy Bypass -NoProfile -File """ & ps1Path & """", 0, False
