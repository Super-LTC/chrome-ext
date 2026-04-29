@echo off
setlocal EnableExtensions

echo ============================================
echo   Super LTC — Enable Auto-Updates
echo ============================================
echo.
echo This will set up automatic background updates for the
echo Super LTC Chrome extension. After this runs once:
echo.
echo   - Every 30 minutes, Windows will check for a new version
echo   - If found, new files are downloaded silently
echo   - A banner in PCC will prompt you to click Reload
echo.
echo No admin access required. Fully transparent — you can see
echo the task in Task Scheduler and the log file at:
echo   %%LOCALAPPDATA%%\SuperLTC\update.log
echo.
pause

REM --- Paths ---------------------------------------------------------------
set "APP_DIR=%LOCALAPPDATA%\SuperLTC"
set "SCRIPT_DIR=%~dp0"
set "UPDATER_SRC=%SCRIPT_DIR%update-super-ltc-silent.ps1"
set "UPDATER_DST=%APP_DIR%\update-super-ltc-silent.ps1"
set "TASK_NAME=Super LTC Auto-Update"

REM --- 1. Ensure app dir ---------------------------------------------------
if not exist "%APP_DIR%" mkdir "%APP_DIR%"

REM --- 2. Copy updater script ---------------------------------------------
if not exist "%UPDATER_SRC%" (
    echo.
    echo ERROR: update-super-ltc-silent.ps1 not found next to this BAT file.
    echo        Make sure you extracted the full zip before running this.
    pause
    exit /b 1
)

copy /Y "%UPDATER_SRC%" "%UPDATER_DST%" >nul
if not exist "%UPDATER_DST%" (
    echo ERROR: Could not copy updater to %APP_DIR%
    pause
    exit /b 1
)

REM --- 3. Remove any existing task, then register fresh -------------------
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

echo Registering scheduled task...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$action   = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-WindowStyle Hidden -ExecutionPolicy Bypass -NoProfile -File \"%UPDATER_DST%\"';" ^
  "$trigger  = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(3) -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration ([TimeSpan]::FromDays(3650));" ^
  "$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15);" ^
  "Register-ScheduledTask -TaskName '%TASK_NAME%' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null"

if errorlevel 1 (
    echo.
    echo ERROR: Failed to register scheduled task.
    pause
    exit /b 1
)

REM --- 4. Run once immediately so they don't wait 30 minutes --------------
echo Running first update check now...
powershell -WindowStyle Hidden -ExecutionPolicy Bypass -NoProfile -File "%UPDATER_DST%"

echo.
echo ============================================
echo   Auto-update is ON
echo ============================================
echo.
echo   Task name: %TASK_NAME%
echo   Updater:   %UPDATER_DST%
echo   Log:       %APP_DIR%\update.log
echo.
echo   To turn this off later: run uninstall-auto-updater.bat
echo.
pause
