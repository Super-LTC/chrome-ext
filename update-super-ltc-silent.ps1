# Super LTC Silent Updater
# Runs in the background (no UI) via Windows Scheduled Task every 30 minutes.
# Checks GitHub Releases for a newer version, downloads, and swaps files
# atomically. The extension's in-browser banner prompts the user to reload
# Chrome when a new version lands on disk.
#
# Log: %LOCALAPPDATA%\SuperLTC\update.log

$ErrorActionPreference = 'Stop'

# Force TLS 1.2 — PowerShell 5.1 (Win10/11 default) defaults to SSL3/TLS1.0,
# which us.i.posthog.com rejects. GitHub has historically tolerated whatever
# the .NET defaults negotiate, but PostHog does not.
try {
    [Net.ServicePointManager]::SecurityProtocol = `
        [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch {}

# --- Paths ----------------------------------------------------------------
$desktop    = [Environment]::GetFolderPath('Desktop')
$installDir = Join-Path $desktop 'super-ltc-extension'
$appDir     = Join-Path $env:LOCALAPPDATA 'SuperLTC'
$logFile    = Join-Path $appDir 'update.log'
$zipFile    = Join-Path $env:TEMP 'super-ltc-extension.zip'
$etagFile   = Join-Path $appDir 'github-etag.txt'
$idFile     = Join-Path $appDir 'distinct-id.txt'
$tempDir    = Join-Path $env:TEMP ("super-ltc-update-" + [guid]::NewGuid().ToString('N'))
$backupDir  = "$installDir.old"

# --- Logging --------------------------------------------------------------
if (-not (Test-Path $appDir)) { New-Item -ItemType Directory -Path $appDir -Force | Out-Null }

function Write-Log {
    param([string]$msg)
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    try { Add-Content -Path $logFile -Value "[$ts] $msg" -ErrorAction SilentlyContinue } catch {}
}

function Cleanup {
    if (Test-Path $zipFile) { Remove-Item $zipFile -Force -ErrorAction SilentlyContinue }
    if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue }
}

# --- Telemetry (PostHog) --------------------------------------------------
# Public project key, same as the extension. Fires & forgets - never blocks
# or fails the update on telemetry errors.
$PosthogKey  = 'phc_AG0ZtYzdQ5ewwDw4XYba67cGgtTsY1Z3qeFQBgBZGWB'
$PosthogHost = 'https://us.i.posthog.com'

function Get-DistinctId {
    try {
        if (Test-Path $idFile) {
            $existing = (Get-Content $idFile -Raw -ErrorAction SilentlyContinue).Trim()
            if ($existing) { return $existing }
        }
        $id = "updater-" + [guid]::NewGuid().ToString('N')
        Set-Content -Path $idFile -Value $id -ErrorAction SilentlyContinue
        return $id
    } catch {
        return "updater-anon"
    }
}

function Send-Telemetry {
    param(
        [string]$Event,
        [hashtable]$Props
    )
    try {
        if (-not $Props) { $Props = @{} }
        $Props['surface']      = 'updater'
        $Props['os']           = 'windows'
        $Props['computer_name'] = $env:COMPUTERNAME
        $Props['username']      = $env:USERNAME
        $payload = @{
            api_key     = $PosthogKey
            event       = $Event
            distinct_id = (Get-DistinctId)
            properties  = $Props
        } | ConvertTo-Json -Depth 5 -Compress
        # NOTE: Invoke-RestMethod does NOT accept -UseBasicParsing on
        # PowerShell 5.1. Including it throws and the ping silently fails.
        Invoke-RestMethod `
            -Uri "$PosthogHost/capture/" `
            -Method Post `
            -ContentType 'application/json' `
            -Body $payload `
            -TimeoutSec 5 | Out-Null
    } catch {
        Write-Log "Telemetry send failed (non-fatal): $_"
    }
}

try {
    Write-Log "===== update check starting ====="

    # --- 1. Confirm the extension is installed ---------------------------
    $manifestPath = Join-Path $installDir 'manifest.json'
    if (-not (Test-Path $manifestPath)) {
        Write-Log "No install at $installDir - nothing to update"
        Send-Telemetry -Event 'updater_check' -Props @{ result = 'not_installed' }
        exit 0
    }

    # --- 2. Read current (on-disk) version -------------------------------
    $currentManifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    $currentVersion  = [string]$currentManifest.version
    Write-Log "Installed version: $currentVersion"

    # --- 3. Query GitHub for latest (etag-cached, doesn't count against rate limit on 304) ---
    $headers = @{
        'User-Agent' = 'SuperLTC-Updater'
        'Accept'     = 'application/vnd.github+json'
    }
    if (Test-Path $etagFile) {
        $cachedEtag = (Get-Content $etagFile -Raw -ErrorAction SilentlyContinue).Trim()
        if ($cachedEtag) { $headers['If-None-Match'] = $cachedEtag }
    }

    try {
        $resp = Invoke-WebRequest `
            -Uri 'https://api.github.com/repos/Superjonathan123/chrome-ext/releases/latest' `
            -Headers $headers -UseBasicParsing
    } catch [System.Net.WebException] {
        # 304 Not Modified shows up as an exception with Invoke-WebRequest
        $statusCode = [int]$_.Exception.Response.StatusCode
        if ($statusCode -eq 304) {
            Write-Log "GitHub: 304 Not Modified - already up to date (etag cache)"
            Send-Telemetry -Event 'updater_check' -Props @{
                result            = 'not_modified_304'
                installed_version = $currentVersion
            }
            exit 0
        }
        throw
    }

    $release = $resp.Content | ConvertFrom-Json
    $newEtag = $resp.Headers['ETag']
    if ($newEtag) {
        try { Set-Content -Path $etagFile -Value $newEtag -ErrorAction SilentlyContinue } catch {}
    }

    $latestVersion = ($release.tag_name -replace '^v', '').Trim()
    Write-Log "Latest release: $latestVersion"

    if ([string]::IsNullOrWhiteSpace($latestVersion)) {
        Write-Log "No valid tag in release payload"
        Send-Telemetry -Event 'updater_check' -Props @{
            result            = 'no_tag_in_payload'
            installed_version = $currentVersion
        }
        exit 0
    }

    # --- 4. Compare versions ---------------------------------------------
    try {
        $currentSem = [version]$currentVersion
        $latestSem  = [version]$latestVersion
    } catch {
        Write-Log "Version parse failed: $_"
        Send-Telemetry -Event 'updater_check' -Props @{
            result            = 'version_parse_failed'
            installed_version = $currentVersion
            latest_version    = $latestVersion
        }
        exit 0
    }

    if ($latestSem -le $currentSem) {
        Write-Log "Already up to date"
        Send-Telemetry -Event 'updater_check' -Props @{
            result            = 'up_to_date'
            installed_version = $currentVersion
            latest_version    = $latestVersion
        }
        exit 0
    }

    Write-Log "Update available: $currentVersion -> $latestVersion"
    Send-Telemetry -Event 'updater_check' -Props @{
        result            = 'update_available'
        installed_version = $currentVersion
        latest_version    = $latestVersion
    }

    # --- 5. Download zip asset -------------------------------------------
    $zipAsset = $release.assets | Where-Object { $_.name -like '*.zip' } | Select-Object -First 1
    if (-not $zipAsset) {
        Write-Log "ERROR: no .zip asset in release"
        throw "no_zip_asset_in_release"
    }

    if (Test-Path $zipFile) { Remove-Item $zipFile -Force -ErrorAction SilentlyContinue }
    Write-Log "Downloading $($zipAsset.browser_download_url)"
    Invoke-WebRequest -Uri $zipAsset.browser_download_url -OutFile $zipFile -UseBasicParsing

    if (-not (Test-Path $zipFile) -or (Get-Item $zipFile).Length -lt 1024) {
        Write-Log "ERROR: download failed or file too small"
        throw "download_failed_or_too_small"
    }

    # --- 6. Extract to temp ----------------------------------------------
    if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    Expand-Archive -Path $zipFile -DestinationPath $tempDir -Force

    if (-not (Test-Path (Join-Path $tempDir 'manifest.json'))) {
        Write-Log "ERROR: extracted zip missing manifest.json"
        throw "extracted_zip_missing_manifest"
    }

    # --- 7. Atomic swap: rename old, move new into place -----------------
    if (Test-Path $backupDir) {
        Remove-Item $backupDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    $renamed = $false
    for ($attempt = 1; $attempt -le 5; $attempt++) {
        try {
            Rename-Item -Path $installDir -NewName ([System.IO.Path]::GetFileName($backupDir)) -ErrorAction Stop
            $renamed = $true
            break
        } catch {
            Write-Log "Rename attempt $attempt failed: $_"
            Start-Sleep -Milliseconds 600
        }
    }

    if (-not $renamed) {
        Write-Log "ERROR: could not rename old folder (file locked?). Aborting."
        throw "rename_install_dir_locked"
    }

    try {
        Move-Item -Path $tempDir -Destination $installDir -Force
    } catch {
        Write-Log "ERROR moving new files into place: $_. Rolling back."
        # Roll back: put old folder back
        if (Test-Path $backupDir) {
            Rename-Item -Path $backupDir -NewName ([System.IO.Path]::GetFileName($installDir)) -ErrorAction SilentlyContinue
        }
        throw "move_new_files_failed: $_"
    }

    # --- 8. Clean up -----------------------------------------------------
    Remove-Item $backupDir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $zipFile -Force -ErrorAction SilentlyContinue

    Write-Log "Update complete: now on $latestVersion"
    Send-Telemetry -Event 'updater_applied' -Props @{
        from_version = $currentVersion
        to_version   = $latestVersion
    }

    # --- 9. Self-update: if the new release ships an updated PS1, copy it
    # over the running copy at $appDir so future runs use the latest logic.
    try {
        $newPs1 = Join-Path $installDir 'update-super-ltc-silent.ps1'
        $myPs1  = Join-Path $appDir     'update-super-ltc-silent.ps1'
        if ((Test-Path $newPs1) -and (Test-Path $myPs1)) {
            $newHash = (Get-FileHash $newPs1 -Algorithm SHA256).Hash
            $myHash  = (Get-FileHash $myPs1  -Algorithm SHA256).Hash
            if ($newHash -ne $myHash) {
                Copy-Item -Path $newPs1 -Destination $myPs1 -Force
                Write-Log "Self-updated updater script in $appDir"
                Send-Telemetry -Event 'updater_self_updated' -Props @{
                    to_version = $latestVersion
                }
            }
        }
    } catch {
        Write-Log "Self-update of updater script failed (non-fatal): $_"
    }

    exit 0

} catch {
    Write-Log "UNHANDLED ERROR: $_"
    $errMsg = "$_"
    if ($errMsg.Length -gt 300) { $errMsg = $errMsg.Substring(0, 300) }
    Send-Telemetry -Event 'updater_error' -Props @{
        message           = $errMsg
        installed_version = $currentVersion
        latest_version    = $latestVersion
    }
    Cleanup
    exit 1
}
