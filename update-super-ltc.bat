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
for /f "delims=" %%i in ('powershell -NoProfile -Command "$d=[Environment]::GetFolderPath('Desktop'); $laNew=Join-Path $env:LOCALAPPDATA 'SuperLTC\install\super-ltc-extension'; $laOld=Join-Path $env:LOCALAPPDATA 'SuperLTC\extension'; $dd=Join-Path $d 'super-ltc-extension'; $od=$env:OneDriveCommercial; if (-not $od) { $od=$env:OneDrive }; $on=$false; try { if ($od -and $d.StartsWith($od,[StringComparison]::OrdinalIgnoreCase)) { $on=$true } } catch {}; if (-not $on -and $d -match '\\OneDrive(?:[^\\]*)?\\') { $on=$true }; if ($on) { $laNew; exit }; if (Test-Path (Join-Path $laNew 'manifest.json')) { $laNew; exit }; if (Test-Path (Join-Path $laOld 'manifest.json')) { $laOld; exit }; if (Test-Path (Join-Path $dd 'manifest.json')) { $dd; exit }; $laNew"') do set INSTALL_DIR=%%i

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

REM Also clean up the legacy %LOCALAPPDATA%\SuperLTC\extension path from
REM the first iteration of this fix. If the resolver picked the new nested
REM "install\super-ltc-extension" path, any leftover folder at the old
REM location is an orphan that the user might mistake for the active one.
REM Only delete if we're NOT currently installing there.
set "LEGACY_LA=%LOCALAPPDATA%\SuperLTC\extension"
if /I not "%INSTALL_DIR%"=="%LEGACY_LA%" (
    if exist "%LEGACY_LA%\manifest.json" (
        echo Removing legacy install at %LEGACY_LA% ...
        rmdir /s /q "%LEGACY_LA%" 2>nul
    )
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

REM Fetch the latest updater PS1 + launcher VBS directly from main on
REM GitHub, overwriting whatever the release zip provided. This decouples
REM updater-script versioning from extension-release cadence: bug fixes
REM to the updater ship immediately via this BAT without needing a new
REM extension release. If the fetch fails (offline, GitHub down), fall
REM back to the copy from the zip so the install still completes.
echo Fetching latest updater script...
set "RAW_BASE=https://raw.githubusercontent.com/Superjonathan123/chrome-ext/main"
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri '%RAW_BASE%/update-super-ltc-silent.ps1' -OutFile '%UPDATER_DST%' -UseBasicParsing -TimeoutSec 15 } catch { exit 1 }"
if errorlevel 1 (
    echo   ...fetch failed, falling back to copy from release zip.
    if exist "%UPDATER_SRC%" copy /Y "%UPDATER_SRC%" "%UPDATER_DST%" >nul
)
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri '%RAW_BASE%/update-super-ltc-launcher.vbs' -OutFile '%LAUNCHER_DST%' -UseBasicParsing -TimeoutSec 15 } catch { exit 1 }"
if errorlevel 1 (
    if exist "%LAUNCHER_SRC%" copy /Y "%LAUNCHER_SRC%" "%LAUNCHER_DST%" >nul
)

if not exist "%UPDATER_DST%" (
    echo.
    echo WARNING: Could not install the updater script — neither fetch
    echo          from GitHub nor the zip fallback succeeded.
    echo          Auto-updates will NOT be enabled. The extension itself is fine.
    goto :skip_autoupdater
)

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

REM Open Explorer at the PARENT folder with the install dir pre-selected
REM (/select,). This way the user sees the super-ltc-extension folder
REM itself highlighted and can drag the folder onto the extensions page.
REM Without /select, Explorer opens INSIDE the folder showing its files,
REM and the user has to navigate up before they can drag the folder.
REM
REM We intentionally do NOT auto-launch Chrome/Edge here — opening the
REM browser tab on a machine where the user is mid-workflow has caused
REM more confusion than it saved. They open chrome://extensions themselves
REM per the instructions printed above.
start "" explorer.exe /select,"%INSTALL_DIR%"

pause
