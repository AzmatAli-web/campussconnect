# Run CampusConnect LIVE on a USB-connected Android device.
# Reads PUBLIC Android Firebase settings from the locally downloaded
# google-services.json (never use Firebase Admin service-account JSON).
# This script DOES NOT write secrets to the repository or modify Firebase.
param(
  [string]$DeviceId = "",
  [int]$Port = 4000
)

$ErrorActionPreference = 'Stop'
if ($Port -lt 1 -or $Port -gt 65535) {
  throw "Port must be between 1 and 65535."
}

$mobileRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$configPath = Join-Path $mobileRoot 'android\app\google-services.json'
$expectedPackage = 'com.campusconnect.campusconnect_mobile'

if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
  throw "Android Firebase config not found. Register $expectedPackage in Firebase project campussconnect-12fdb, download google-services.json and save it to mobile/android/app/google-services.json. See docs/USB_ANDROID_LIVE_TEST.md."
}

try {
  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
} catch {
  throw "google-services.json is not valid JSON. Download a fresh copy from Firebase."
}

$matchingClients = @($config.client | Where-Object {
  $_.client_info.android_client_info.package_name -eq $expectedPackage
})
if ($matchingClients.Count -ne 1) {
  throw "Config must contain exactly one Android Firebase client with package $expectedPackage. Do not use the existing web app."
}
$client = $matchingClients[0]
$apiKey = [string]($client.api_key | Select-Object -First 1).current_key
$appId = [string]$client.client_info.mobilesdk_app_id
$senderId = [string]$config.project_info.project_number
$projectId = [string]$config.project_info.project_id

if ([string]::IsNullOrWhiteSpace($apiKey) -or
    [string]::IsNullOrWhiteSpace($appId) -or
    [string]::IsNullOrWhiteSpace($senderId) -or
    $projectId -ne 'campussconnect-12fdb' -or
    $appId -notmatch ':android:') {
  throw "Invalid Firebase Android config. Verify app registration and project ID in Firebase Console."
}

if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
  throw "Flutter CLI is not on PATH. Flutter worked previously, so reopen the same PowerShell terminal or check Flutter PATH."
}

# Android SDK is installed (flutter doctor passed). adb may not be on PATH.
$adbCommand = Get-Command adb -ErrorAction SilentlyContinue
$adbPath = if ($adbCommand) { $adbCommand.Source } else { $null }
if (-not $adbPath) {
  $sdkCandidates = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT)
  if ($env:LOCALAPPDATA) {
    $sdkCandidates += (Join-Path $env:LOCALAPPDATA 'Android\Sdk')
  }
  foreach ($sdkRoot in $sdkCandidates) {
    if (-not $sdkRoot) { continue }
    $candidate = Join-Path $sdkRoot 'platform-tools\adb.exe'
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      $adbPath = $candidate
      break
    }
  }
}
if (-not $adbPath) {
  throw "adb.exe not found. Run 'flutter doctor -v' to find the Android SDK, then add its platform-tools directory to PATH."
}

$detected = @()
$deviceLines = & $adbPath devices
if ($LASTEXITCODE -ne 0) { throw "adb devices failed. Check USB debugging." }
foreach ($line in $deviceLines) {
  if ($line -match '^(\S+)\s+device\s*$') {
    $detected += $Matches[1]
  }
}
if (-not $DeviceId) {
  if ($detected.Count -eq 0) {
    throw "No authorized Android device detected. Unlock the phone, enable USB debugging, accept the RSA authorization prompt, and retry."
  }
  if ($detected.Count -gt 1) {
    throw "Multiple Android devices detected. Run the script with -DeviceId <device id> using the ID shown in 'flutter devices'."
  }
  $DeviceId = $detected[0]
}
if ($DeviceId -notin $detected) {
  throw "Android device '$DeviceId' is not connected/authorized. Run adb devices."
}

# Server must already be running on this same Windows PC, port 4000 by default.
try {
  $response = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:$Port/api/v1/health/live" -TimeoutSec 5
} catch {
  throw "CampusConnect backend isn't responding on localhost:$Port. In another terminal run: cd backend; npm.cmd run dev. Then retry."
}

Write-Host "Backend reachable on port $Port. Config is for $projectId / Android app." -ForegroundColor Green
Write-Host "Forwarding phone localhost:$Port to PC localhost:$Port over USB..."
& $adbPath -s $DeviceId reverse "tcp:$Port" "tcp:$Port"
if ($LASTEXITCODE -ne 0) {
  throw "adb reverse failed. Reconnect the USB cable, accept phone debugging prompt, and retry."
}

Write-Host "Launching LIVE Firebase-connected CampusConnect on $DeviceId..." -ForegroundColor Cyan
Write-Host "Do not select the offline preview flag. Keep the backend running." -ForegroundColor Cyan

# Each --dart-define value is a public Firebase client setting, not an Admin key.
# Avoid echoing the Firebase API key to terminal output.
$flutterArgs = @(
  'run',
  '-d', $DeviceId,
  '--dart-define=CAMPUSCONNECT_PREVIEW=false',
  "--dart-define=API_BASE_URL=http://127.0.0.1:$Port/api/v1",
  "--dart-define=FIREBASE_ANDROID_API_KEY=$apiKey",
  "--dart-define=FIREBASE_ANDROID_APP_ID=$appId",
  "--dart-define=FIREBASE_MESSAGING_SENDER_ID=$senderId",
  "--dart-define=FIREBASE_PROJECT_ID=$projectId"
)

Push-Location $mobileRoot
try {
  & flutter @flutterArgs
  if ($LASTEXITCODE -ne 0) {
    throw "flutter run exited with code $LASTEXITCODE. Check the Flutter error output."
  }
} finally {
  Pop-Location
}
