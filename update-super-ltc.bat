@echo off
setlocal EnableExtensions

REM Move out of the user's CWD before doing ANYTHING — including the
REM PowerShell calls below that resolve the install dir. If the user
REM launched this BAT from inside %INSTALL_DIR%, or from a deleted/broken
REM folder left over from a previous failed run, PowerShell inherits that
REM broken CWD and returns empty paths, which cascades into mkdir failing
REM later with "The system cannot find the path specified." %USERPROFILE%
REM is always present and writable.
cd /d "%USERPROFILE%"

echo ============================================
echo   Super LTC Extension Installer / Updater
echo ============================================
echo.

REM --- Paths ---------------------------------------------------------------
REM Pick the install directory dynamically:
REM   - Default: Desktop\super-ltc-extension (easy to find).
REM   - If Desktop is OneDrive-redirected: %LOCALAPPDATA%\SuperLTC\extension.
REM     OneDrive sync corrupts the unpacked extension — Chrome/Edge reads
REM     manifest.json mid-sync and disables it with "Manifest file is
REM     missing or unreadable".
REM   - If an install already exists at %LOCALAPPDATA%, prefer it.
for /f "delims=" %%i in ('powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"') do set DESKTOP=%%i
for /f "delims=" %%i in ('powershell -NoProfile -Command "$d=[Environment]::GetFolderPath('Desktop'); $la=Join-Path $env:LOCALAPPDATA 'SuperLTC\extension'; $dd=Join-Path $d 'super-ltc-extension'; $od=$env:OneDriveCommercial; if (-not $od) { $od=$env:OneDrive }; $on=$false; try { if ($od -and $d.StartsWith($od,[StringComparison]::OrdinalIgnoreCase)) { $on=$true } } catch {}; if (-not $on -and $d -match '\\OneDrive(?:[^\\]*)?\\') { $on=$true }; if ($on) { $la; exit }; if (Test-Path (Join-Path $la 'manifest.json')) { $la; exit }; $dd"') do set INSTALL_DIR=%%i

REM Defensive: if PowerShell quoting / detection blew up and INSTALL_DIR is
REM empty, fall back to the historical Desktop path rather than failing later
REM with cryptic "cannot find path" errors. Better to install to the old
REM location than to nuke a random folder.
if "%INSTALL_DIR%"=="" (
    echo.
    echo WARNING: Could not auto-detect install directory ^(PowerShell returned
    echo          nothing^). Falling back to Desktop\super-ltc-extension.
    echo.
    set "INSTALL_DIR=%DESKTOP%\super-ltc-extension"
)
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

echo.
echo Install target: %INSTALL_DIR%
echo.

echo Clearing old files...
if exist "%INSTALL_DIR%" rmdir /s /q "%INSTALL_DIR%"
if exist "%INSTALL_DIR%" (
    echo.
    echo ERROR: Could not clear old install folder:
    echo   %INSTALL_DIR%
    echo Close Chrome/Edge and any File Explorer windows pointing at that
    echo folder, then run this BAT again.
    pause
    exit /b 1
)

REM Make sure the parent directory exists before we mkdir the install dir.
REM mkdir's auto-create-intermediates only kicks in with command extensions,
REM and even then it can fail with "system cannot find the path specified"
REM on edge cases. PowerShell's New-Item -Force is more reliable across
REM Windows versions and creates all missing intermediates unconditionally.
echo Creating install folder...
powershell -NoProfile -Command "New-Item -ItemType Directory -Path '%INSTALL_DIR%' -Force | Out-Null"
if not exist "%INSTALL_DIR%" (
    echo.
    echo ERROR: Could not create install folder:
    echo   %INSTALL_DIR%
    echo Check that you have write permission to that location.
    pause
    exit /b 1
)

echo Extracting new version...
powershell -NoProfile -Command "Expand-Archive -Path '%ZIP_FILE%' -DestinationPath '%INSTALL_DIR%' -Force"
if not exist "%INSTALL_DIR%\manifest.json" (
    echo.
    echo ERROR: Extraction did not produce a manifest.json in:
    echo   %INSTALL_DIR%
    echo The download may be corrupt. Try again.
    pause
    exit /b 1
)

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

REM Heads-up if we just migrated off the Desktop because of OneDrive sync.
if /I not "%INSTALL_DIR%"=="%DESKTOP%\super-ltc-extension" if exist "%DESKTOP%\super-ltc-extension\manifest.json" (
    echo *** IMPORTANT — OneDrive was detected on your Desktop, so the extension
    echo     was installed to %INSTALL_DIR% instead of the Desktop. This avoids
    echo     a Chrome/Edge bug where OneDrive sync corrupts the extension files.
    echo.
    echo     Your OLD install on the Desktop is no longer being updated.
    echo     Open chrome://extensions  ^(or edge://extensions^)  and click
    echo     "Remove" on the old "Super LTC for Point Click Care" entry, then
    echo     drag the new folder ^(opened below^) onto the extensions page.
    echo.
)
echo If you ALREADY have the extension loaded:
echo   - Just go to your extensions page and click the reload icon.
echo   - Then refresh your PCC page. You're done.
echo.
echo If this is your FIRST TIME (or the extension is no longer listed):
echo   - Two windows will open below:
echo       (1) chrome://extensions  (or edge://extensions)
echo       (2) The extension folder in File Explorer
echo   - DRAG the folder from File Explorer onto the extensions page.
echo   - Chrome/Edge will install it. Refresh your PCC page.
echo.
echo From now on, future updates download in the background every 30 minutes.
echo You'll see a banner in PCC when a new version is ready to reload.
echo.

REM Pick the right browser and open its extensions page, plus File Explorer
REM at the install folder. User drags the folder onto the page.
REM
REM Priority:
REM   1. Whichever browser is currently running (probably the one they're using)
REM   2. Chrome at known install paths
REM   3. Edge at known install paths (ships with Windows 10+)
REM   4. Bare name via App Paths registry, last resort
REM
REM Each candidate is checked one line at a time and jumps to :open_browser
REM when found. This avoids batch's delayed-expansion footgun where vars set
REM inside (parens) aren't visible to later lines in the same block.
set "BROWSER_EXE="
set "BROWSER_URL="

REM 1. Currently-running browser wins
tasklist /FI "IMAGENAME eq chrome.exe" 2>nul | find /I "chrome.exe" >nul && goto :pick_chrome
tasklist /FI "IMAGENAME eq msedge.exe" 2>nul | find /I "msedge.exe" >nul && goto :pick_edge

REM 2/3. No running browser — Chrome first, then Edge
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" goto :pick_chrome
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" goto :pick_chrome
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" goto :pick_chrome
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" goto :pick_edge
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" goto :pick_edge

REM 4. Final fallback
goto :pick_edge

:pick_chrome
set "BROWSER_URL=chrome://extensions/"
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe" & goto :open_browser
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" & goto :open_browser
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "BROWSER_EXE=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" & goto :open_browser
REM Chrome was running but we can't find the .exe — fall back to bare name (App Paths)
set "BROWSER_EXE=chrome"
goto :open_browser

:pick_edge
set "BROWSER_URL=edge://extensions/"
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" & goto :open_browser
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" & goto :open_browser
set "BROWSER_EXE=msedge"
goto :open_browser

:open_browser
REM Always open Explorer at the install folder so the user can drag it.
start "" explorer.exe "%INSTALL_DIR%"

REM --new-window forces Chrome/Edge to open a fresh window with the URL.
REM Without it, if the browser is already running, the URL is sent via IPC
REM to the existing process and may land in a background tab the user
REM doesn't notice — or, on Edge's warm-but-windowless state, get lost
REM entirely and open to the home page instead.
start "" "%BROWSER_EXE%" --new-window "%BROWSER_URL%"

pause
