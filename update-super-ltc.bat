@echo off
setlocal EnableExtensions
echo ============================================
echo   Super LTC Extension Installer / Updater
echo ============================================
echo.

REM --- Paths ---------------------------------------------------------------
for /f "delims=" %%i in ('powershell -Command "[Environment]::GetFolderPath('Desktop')"') do set DESKTOP=%%i
set INSTALL_DIR=%DESKTOP%\super-ltc-extension
set ZIP_URL=https://github.com/Superjonathan123/chrome-ext/releases/latest/download/super-ltc-extension.zip
set ZIP_FILE=%TEMP%\super-ltc-extension.zip
set APP_DIR=%LOCALAPPDATA%\SuperLTC
set UPDATER_SRC=%INSTALL_DIR%\update-super-ltc-silent.ps1
set UPDATER_DST=%APP_DIR%\update-super-ltc-silent.ps1
set LAUNCHER_SRC=%INSTALL_DIR%\update-super-ltc-launcher.vbs
set LAUNCHER_DST=%APP_DIR%\update-super-ltc-launcher.vbs
set TASK_NAME=Super LTC Auto-Update

REM --- 1. Download and extract latest release -----------------------------
echo Downloading latest version...
powershell -Command "Invoke-WebRequest -Uri '%ZIP_URL%' -OutFile '%ZIP_FILE%'"

if not exist "%ZIP_FILE%" (
    echo.
    echo ERROR: Download failed. Check your internet connection.
    pause
    exit /b 1
)

echo Clearing old files...
if exist "%INSTALL_DIR%" rmdir /s /q "%INSTALL_DIR%"
mkdir "%INSTALL_DIR%"

echo Extracting new version...
powershell -Command "Expand-Archive -Path '%ZIP_FILE%' -DestinationPath '%INSTALL_DIR%' -Force"

del "%ZIP_FILE%"

REM --- 2. Set up the silent auto-updater ----------------------------------
REM Copies the silent PowerShell updater into %LOCALAPPDATA% and registers
REM a Windows scheduled task that runs it every 30 minutes. Safe to re-run:
REM the task is deleted and re-created, the .ps1 is overwritten in place.
echo.
echo Setting up automatic background updates...

if not exist "%APP_DIR%" mkdir "%APP_DIR%"

if not exist "%UPDATER_SRC%" (
    echo.
    echo WARNING: update-super-ltc-silent.ps1 not found in the extracted zip.
    echo          Auto-updates will NOT be enabled. The extension itself is fine.
    goto :skip_autoupdater
)

copy /Y "%UPDATER_SRC%" "%UPDATER_DST%" >nul
if exist "%LAUNCHER_SRC%" copy /Y "%LAUNCHER_SRC%" "%LAUNCHER_DST%" >nul

schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

REM Use the VBS launcher (via wscript.exe) to run the .ps1 truly hidden.
REM Running powershell.exe directly from Task Scheduler flashes a console
REM window in interactive sessions even with -WindowStyle Hidden.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$action   = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument '\"%LAUNCHER_DST%\"';" ^
  "$trigger  = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(3) -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration ([TimeSpan]::FromDays(3650));" ^
  "$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15);" ^
  "Register-ScheduledTask -TaskName '%TASK_NAME%' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null"

if errorlevel 1 (
    echo.
    echo WARNING: Could not register the auto-update scheduled task.
    echo          The extension is installed, but auto-updates are NOT enabled.
    goto :skip_autoupdater
)

REM Run once immediately via the launcher so the first telemetry ping
REM fires without showing a window, and the task doesn't have to wait
REM the full 3 minutes before its first run.
wscript.exe "%LAUNCHER_DST%"
echo Auto-update task registered: "%TASK_NAME%"

:skip_autoupdater

echo.
echo ============================================
echo   Done!
echo ============================================
echo.
echo Extension files are in: %INSTALL_DIR%
echo Auto-update log:        %APP_DIR%\update.log
echo.
echo NOW DO THIS:
echo   1. Open Chrome
echo   2. Go to chrome://extensions
echo   3. Click the reload button (circular arrow)
echo   4. Refresh your PCC page
echo.
echo If this is your FIRST TIME:
echo   1. Open Chrome
echo   2. Go to chrome://extensions
echo   3. Turn on "Developer mode" (top right)
echo   4. Click "Load unpacked"
echo   5. Select: %INSTALL_DIR%
echo.
echo From now on, future updates download in the background every 30 minutes.
echo You'll see a banner in PCC when a new version is ready to reload.
echo.
pause
