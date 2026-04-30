# Super LTC updater diagnostic
# Run in PowerShell on the affected machine. Send the full output back.
#
# Usage:
#   1. Open PowerShell (Win + R, type "powershell", Enter)
#   2. Paste the entire contents of this file and press Enter
#   3. Copy the entire output and send it back

$appDir     = "$env:LOCALAPPDATA\SuperLTC"
$logFile    = "$appDir\update.log"
$myPs1      = "$appDir\update-super-ltc-silent.ps1"
$installDir = "$([Environment]::GetFolderPath('Desktop'))\super-ltc-extension"

Write-Host "`n=== 1. Files & versions ===" -ForegroundColor Cyan
"PowerShell version: $($PSVersionTable.PSVersion)"
"Updater script:     $myPs1  (exists: $(Test-Path $myPs1))"
"Extension dir:      $installDir  (exists: $(Test-Path $installDir))"
if (Test-Path "$installDir\manifest.json") {
    "Installed version:  $((Get-Content "$installDir\manifest.json" -Raw | ConvertFrom-Json).version)"
}
if (Test-Path $myPs1) {
    "Updater hash:       $((Get-FileHash $myPs1 -Algorithm SHA256).Hash.Substring(0,16))..."
    "Has TLS 1.2 fix:    $([bool](Select-String -Path $myPs1 -Pattern 'Tls12' -SimpleMatch -Quiet))"
    $hasBug = Select-String -Path $myPs1 -Pattern 'Invoke-RestMethod' -Context 0,5 |
              Where-Object { $_.Context.PostContext -match 'UseBasicParsing' }
    "Has UseBasicParsing bug:  $([bool]$hasBug)"
}

Write-Host "`n=== 2. Scheduled task ===" -ForegroundColor Cyan
schtasks /query /tn "Super LTC Auto-Update" /v /fo LIST 2>&1 |
    Select-String -Pattern 'TaskName|Next Run|Last Run|Last Result|Status' |
    ForEach-Object { $_.Line.Trim() }

Write-Host "`n=== 3. PostHog reachability test ===" -ForegroundColor Cyan
try {
    [Net.ServicePointManager]::SecurityProtocol =
        [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $body = @{
        api_key     = 'phc_AG0ZtYzdQ5ewwDw4XYba67cGgtTsY1Z3qeFQBgBZGWB'
        event       = 'updater_debug_ping'
        distinct_id = "michael-debug-$env:COMPUTERNAME"
        properties  = @{
            surface       = 'updater'
            os            = 'windows'
            computer_name = $env:COMPUTERNAME
            username      = $env:USERNAME
            note          = 'manual diagnostic'
        }
    } | ConvertTo-Json -Depth 5 -Compress
    $r = Invoke-RestMethod -Uri 'https://us.i.posthog.com/capture/' `
                           -Method Post `
                           -ContentType 'application/json' `
                           -Body $body `
                           -TimeoutSec 10
    "PostHog response: $($r | ConvertTo-Json -Compress)"
} catch {
    Write-Host "PostHog call FAILED: $_" -ForegroundColor Red
    Write-Host "Inner: $($_.Exception.InnerException)" -ForegroundColor Red
}

Write-Host "`n=== 4. Run updater manually (verbose) ===" -ForegroundColor Cyan
if (Test-Path $myPs1) {
    & $myPs1 *>&1 | ForEach-Object { "  $_" }
} else {
    Write-Host "Updater script not found — install-auto-updater.bat was never run successfully." -ForegroundColor Red
}

Write-Host "`n=== 5. Last 30 lines of update.log ===" -ForegroundColor Cyan
if (Test-Path $logFile) {
    Get-Content $logFile -Tail 30
} else {
    Write-Host "No log file at $logFile" -ForegroundColor Yellow
}
