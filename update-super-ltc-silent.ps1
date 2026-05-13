# Super LTC Silent Updater
# Runs in the background (no UI) via Windows Scheduled Task every 30 minutes.
# Checks GitHub Releases for a newer version, downloads, and installs files
# in place. The extension's in-browser banner prompts the user to reload
# Chrome when a new version lands on disk.
#
# Strategy: in-place file copy with per-file atomic renames. The install
# folder ($installDir) is NEVER renamed or deleted, so Chrome cannot lose
# its handle on the unpacked extension. Each file is written to a `.new.tmp`
# sibling, then Move-Item -Force atomically replaces the live file. The
# manifest.json is written LAST so Chrome (if it ever re-reads) only sees a
# coherent old-or-new state, never a half-update.
#
# If Chrome is open with PCC tabs active, the update is deferred to the
# next scheduled tick. Belt-and-suspenders: the in-place strategy is itself
# safe, but skipping when Chrome is reading PCC narrows the window further.
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
# Install location strategy:
#   - Default: Desktop\super-ltc-extension (existing behavior, easy to find).
#   - If Desktop is redirected into OneDrive: %LOCALAPPDATA%\SuperLTC\extension.
#     OneDrive sync on the Desktop corrupts the unpacked extension — Chrome
#     reads manifest.json mid-sync and disables the extension with
#     "Manifest file is missing or unreadable". %LOCALAPPDATA% is never synced.
#   - If an existing install is already at %LOCALAPPDATA%, prefer it
#     regardless (user already migrated, or fresh installer chose it).
$desktop    = [Environment]::GetFolderPath('Desktop')

function Resolve-InstallDir {
    $localAppDir = Join-Path $env:LOCALAPPDATA 'SuperLTC\extension'
    $desktopDir  = Join-Path $desktop 'super-ltc-extension'

    # Existing install wins, regardless of OneDrive status.
    if (Test-Path (Join-Path $localAppDir 'manifest.json')) { return $localAppDir }
    if (Test-Path (Join-Path $desktopDir  'manifest.json')) { return $desktopDir  }

    # No existing install — pick based on whether Desktop is OneDrive-redirected.
    # Detect two ways (belt-and-suspenders, since OneDrive env vars are only
    # set when the OneDrive client is running in this user session):
    #   1. env vars $OneDrive / $OneDriveCommercial point at the OneDrive root
    #   2. Desktop path literally contains a "\OneDrive..." segment
    $oneDrive = $env:OneDriveCommercial
    if (-not $oneDrive) { $oneDrive = $env:OneDrive }
    $onOneDrive = $false
    try {
        if ($oneDrive -and $desktop.StartsWith($oneDrive, [StringComparison]::OrdinalIgnoreCase)) {
            $onOneDrive = $true
        }
    } catch {}
    if (-not $onOneDrive -and $desktop -match '\\OneDrive(?:[^\\]*)?\\') {
        $onOneDrive = $true
    }

    if ($onOneDrive) { return $localAppDir } else { return $desktopDir }
}

$installDir = Resolve-InstallDir
$appDir     = Join-Path $env:LOCALAPPDATA 'SuperLTC'
$logFile    = Join-Path $appDir 'update.log'
$zipFile    = Join-Path $env:TEMP 'super-ltc-extension.zip'
$etagFile   = Join-Path $appDir 'github-etag.txt'
$idFile     = Join-Path $appDir 'distinct-id.txt'
$tempDir    = Join-Path $env:TEMP ("super-ltc-update-" + [guid]::NewGuid().ToString('N'))

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
        $Props['surface']       = 'updater'
        $Props['os']            = 'windows'
        $Props['computer_name'] = $env:COMPUTERNAME
        $Props['username']      = $env:USERNAME
        $Props['updater_strategy'] = 'in_place_v2'
        $Props['install_dir']   = $installDir
        $Props['install_on_localappdata'] = $installDir -like "$env:LOCALAPPDATA*"
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

# --- Chrome/Edge + PCC active detection ----------------------------------
# If Chrome or Edge is open AND has any tab with a PCC URL, defer this run.
# We can't read tab URLs from PowerShell, but window titles reflect the
# active tab title which usually contains "PointClickCare". Best-effort
# heuristic: if any chrome.exe or msedge.exe process has a window title
# matching PCC, defer. False negatives are fine (in-place copy is safe
# anyway).
function Test-ChromePccActive {
    try {
        $procs = Get-Process -Name 'chrome','msedge' -ErrorAction SilentlyContinue
        if (-not $procs) { return $false }
        foreach ($p in $procs) {
            $title = $p.MainWindowTitle
            if ($title -and ($title -match 'PointClickCare' -or $title -match 'pointclickcare\.com')) {
                return $true
            }
        }
        return $false
    } catch {
        return $false
    }
}

# --- In-place install -----------------------------------------------------
# Copies all files from $sourceDir into $installDir, preserving subdirs.
# manifest.json is held back and written LAST so Chrome cannot observe a
# manifest that references files not yet on disk. Each file is written to
# a temp sibling with .new.tmp suffix and Move-Item -Force replaces the
# live file (atomic on NTFS, single volume).
#
# Returns @{ installed = <int>; skipped = <int>; failed = <int>; failedFiles = <string[]> }
function Install-FilesInPlace {
    param(
        [string]$SourceDir,
        [string]$DestDir
    )

    $result = @{
        installed   = 0
        skipped     = 0
        failed      = 0
        failedFiles = @()
    }

    # Collect all files to install, holding manifest.json for last
    $allFiles = Get-ChildItem -Path $SourceDir -Recurse -File
    $manifestSrc = $allFiles | Where-Object { $_.FullName -eq (Join-Path $SourceDir 'manifest.json') } | Select-Object -First 1
    $otherFiles = $allFiles | Where-Object { $_.FullName -ne (Join-Path $SourceDir 'manifest.json') }

    # Write all non-manifest files first
    foreach ($file in $otherFiles) {
        $relPath = $file.FullName.Substring($SourceDir.Length).TrimStart('\','/')
        $destFile = Join-Path $DestDir $relPath
        $destParent = Split-Path $destFile -Parent

        if (-not (Test-Path $destParent)) {
            try {
                New-Item -ItemType Directory -Path $destParent -Force | Out-Null
            } catch {
                Write-Log "Could not create dir $destParent : $_"
                $result.failed++
                $result.failedFiles += $relPath
                continue
            }
        }

        # Skip if identical (cheap reduction in disk churn / lock conflicts)
        if (Test-Path $destFile) {
            try {
                $srcHash  = (Get-FileHash $file.FullName -Algorithm SHA256).Hash
                $destHash = (Get-FileHash $destFile     -Algorithm SHA256).Hash
                if ($srcHash -eq $destHash) {
                    $result.skipped++
                    continue
                }
            } catch {
                # fall through to rewrite
            }
        }

        $tmpDest = "$destFile.new.tmp"
        $written = $false
        for ($attempt = 1; $attempt -le 5; $attempt++) {
            try {
                Copy-Item -Path $file.FullName -Destination $tmpDest -Force -ErrorAction Stop
                Move-Item  -Path $tmpDest -Destination $destFile -Force -ErrorAction Stop
                $written = $true
                break
            } catch {
                Write-Log "Write attempt $attempt failed for $relPath : $_"
                Start-Sleep -Milliseconds 400
                if (Test-Path $tmpDest) { Remove-Item $tmpDest -Force -ErrorAction SilentlyContinue }
            }
        }

        if ($written) {
            $result.installed++
        } else {
            $result.failed++
            $result.failedFiles += $relPath
        }
    }

    # Now write manifest.json LAST (atomic). If we got here with file failures
    # but the manifest still bumps, Chrome would see a manifest pointing at
    # not-yet-updated files. Bail out before touching the manifest if any
    # non-manifest file failed.
    if ($result.failed -gt 0) {
        Write-Log "Skipping manifest.json swap because $($result.failed) file(s) failed"
        return $result
    }

    if ($manifestSrc) {
        $destManifest = Join-Path $DestDir 'manifest.json'
        $tmpManifest  = "$destManifest.new.tmp"
        $written = $false
        for ($attempt = 1; $attempt -le 5; $attempt++) {
            try {
                Copy-Item -Path $manifestSrc.FullName -Destination $tmpManifest -Force -ErrorAction Stop
                Move-Item  -Path $tmpManifest -Destination $destManifest -Force -ErrorAction Stop
                $written = $true
                break
            } catch {
                Write-Log "Manifest write attempt $attempt failed: $_"
                Start-Sleep -Milliseconds 400
                if (Test-Path $tmpManifest) { Remove-Item $tmpManifest -Force -ErrorAction SilentlyContinue }
            }
        }
        if ($written) {
            $result.installed++
        } else {
            $result.failed++
            $result.failedFiles += 'manifest.json'
        }
    }

    return $result
}

# Removes files in $DestDir that are not present in $SourceDir. Run AFTER
# manifest swap so Chrome's freshly-bumped manifest never references a file
# we're about to delete.
function Remove-StaleFiles {
    param(
        [string]$SourceDir,
        [string]$DestDir
    )
    $removed = 0
    $sourceRel = @{}
    Get-ChildItem -Path $SourceDir -Recurse -File | ForEach-Object {
        $rel = $_.FullName.Substring($SourceDir.Length).TrimStart('\','/').ToLower()
        $sourceRel[$rel] = $true
    }
    Get-ChildItem -Path $DestDir -Recurse -File | ForEach-Object {
        $rel = $_.FullName.Substring($DestDir.Length).TrimStart('\','/').ToLower()
        if (-not $sourceRel.ContainsKey($rel)) {
            try {
                Remove-Item $_.FullName -Force -ErrorAction Stop
                $removed++
            } catch {
                Write-Log "Could not remove stale file $rel : $_"
            }
        }
    }
    return $removed
}

# --- Main flow ------------------------------------------------------------
$currentVersion = $null
$latestVersion  = $null

try {
    Write-Log "===== update check starting (in-place v2) ====="

    # 1. Confirm the extension is installed
    $manifestPath = Join-Path $installDir 'manifest.json'
    if (-not (Test-Path $manifestPath)) {
        Write-Log "No install at $installDir - nothing to update"
        Send-Telemetry -Event 'updater_check' -Props @{ result = 'not_installed' }
        exit 0
    }

    # 2. Read current (on-disk) version
    $currentManifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    $currentVersion  = [string]$currentManifest.version
    Write-Log "Installed version: $currentVersion"

    # 3. Query GitHub for latest (etag-cached)
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

    # 4. Compare versions
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

    # 5. Defer if Chrome is actively viewing PCC
    if (Test-ChromePccActive) {
        Write-Log "Chrome has PCC tabs active - deferring update to next tick"
        Send-Telemetry -Event 'updater_check' -Props @{
            result            = 'deferred_chrome_pcc_active'
            installed_version = $currentVersion
            latest_version    = $latestVersion
        }
        exit 0
    }

    Send-Telemetry -Event 'updater_check' -Props @{
        result            = 'update_available'
        installed_version = $currentVersion
        latest_version    = $latestVersion
    }

    # 6. Download zip asset
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

    # 7. Extract to temp
    if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    Expand-Archive -Path $zipFile -DestinationPath $tempDir -Force

    # If the zip contains a single top-level folder, descend into it. Some
    # release zip workflows wrap the build in a folder; others are flat.
    $tempEntries = Get-ChildItem -Path $tempDir
    if ($tempEntries.Count -eq 1 -and $tempEntries[0].PSIsContainer) {
        $extractedRoot = $tempEntries[0].FullName
    } else {
        $extractedRoot = $tempDir
    }

    $newManifestPath = Join-Path $extractedRoot 'manifest.json'
    if (-not (Test-Path $newManifestPath)) {
        Write-Log "ERROR: extracted zip missing manifest.json"
        throw "extracted_zip_missing_manifest"
    }

    # 8. Validate new manifest parses & version matches the release tag
    try {
        $newManifest    = Get-Content $newManifestPath -Raw | ConvertFrom-Json
        $newManifestVer = [string]$newManifest.version
    } catch {
        Write-Log "ERROR: new manifest.json failed to parse: $_"
        throw "new_manifest_parse_failed"
    }

    if ([string]::IsNullOrWhiteSpace($newManifestVer)) {
        Write-Log "ERROR: new manifest has no version"
        throw "new_manifest_no_version"
    }

    Write-Log "New manifest version: $newManifestVer (release tag: $latestVersion)"

    # 9. In-place install (non-manifest files first, then manifest atomically)
    $installResult = Install-FilesInPlace -SourceDir $extractedRoot -DestDir $installDir

    Write-Log ("Install result: installed={0} skipped={1} failed={2}" -f `
        $installResult.installed, $installResult.skipped, $installResult.failed)

    if ($installResult.failed -gt 0) {
        $failedSample = ($installResult.failedFiles | Select-Object -First 5) -join ', '
        Write-Log "Files failed (first 5): $failedSample"
        Send-Telemetry -Event 'updater_error' -Props @{
            message           = 'in_place_copy_partial_failure'
            failed_count      = $installResult.failed
            failed_sample     = $failedSample
            installed_version = $currentVersion
            latest_version    = $latestVersion
        }
        # Old code is still consistent on disk because we bailed before
        # touching manifest.json. Leave extension running on old version,
        # retry next tick.
        Cleanup
        exit 1
    }

    # 10. Remove stale files (post-manifest, so Chrome's new manifest never
    #     references something we're deleting)
    $removed = Remove-StaleFiles -SourceDir $extractedRoot -DestDir $installDir
    Write-Log "Removed $removed stale file(s)"

    Write-Log "Update complete: now on $latestVersion"
    Send-Telemetry -Event 'updater_applied' -Props @{
        from_version    = $currentVersion
        to_version      = $latestVersion
        files_installed = $installResult.installed
        files_skipped   = $installResult.skipped
        files_removed   = $removed
    }

    # 11. Self-update: copy new PS1/VBS into $appDir if they changed
    try {
        $newPs1 = Join-Path $installDir 'update-super-ltc-silent.ps1'
        $myPs1  = Join-Path $appDir     'update-super-ltc-silent.ps1'
        $newVbs = Join-Path $installDir 'update-super-ltc-launcher.vbs'
        $myVbs  = Join-Path $appDir     'update-super-ltc-launcher.vbs'
        $copied = $false
        if ((Test-Path $newPs1) -and (Test-Path $myPs1)) {
            $newHash = (Get-FileHash $newPs1 -Algorithm SHA256).Hash
            $myHash  = (Get-FileHash $myPs1  -Algorithm SHA256).Hash
            if ($newHash -ne $myHash) {
                Copy-Item -Path $newPs1 -Destination $myPs1 -Force
                Write-Log "Self-updated updater PS1 in $appDir"
                $copied = $true
            }
        }
        if (Test-Path $newVbs) {
            if (-not (Test-Path $myVbs) -or
                ((Get-FileHash $newVbs -Algorithm SHA256).Hash -ne (Get-FileHash $myVbs -Algorithm SHA256).Hash)) {
                Copy-Item -Path $newVbs -Destination $myVbs -Force
                Write-Log "Self-updated launcher VBS in $appDir"
                $copied = $true
            }
        }
        if ($copied) {
            Send-Telemetry -Event 'updater_self_updated' -Props @{
                to_version = $latestVersion
            }
        }
    } catch {
        Write-Log "Self-update of updater script failed (non-fatal): $_"
    }

    Cleanup
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
