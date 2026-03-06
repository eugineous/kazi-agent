# BUILD_INSTALLER.ps1 — Kazi Agent Windows Installer Builder
# Run with: powershell -ExecutionPolicy Bypass -File BUILD_INSTALLER.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   KAZI AGENT - Windows Installer Build" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── Locate Node.js ───────────────────────────────────────────────────────────
function Find-Node {
    # 1. Already in PATH?
    $n = Get-Command node -ErrorAction SilentlyContinue
    if ($n) { return $n.Source }

    # 2. Common install dirs
    $candidates = @(
        "C:\Program Files\nodejs\node.exe",
        "C:\Program Files (x86)\nodejs\node.exe",
        "$env:LOCALAPPDATA\Programs\nodejs\node.exe",
        "$env:LOCALAPPDATA\nvm\current\node.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }

    # 3. Registry
    $regPaths = @(
        "HKLM:\SOFTWARE\Node.js",
        "HKLM:\SOFTWARE\WOW6432Node\Node.js"
    )
    foreach ($rp in $regPaths) {
        try {
            $installPath = (Get-ItemProperty -Path $rp -Name InstallPath -ErrorAction Stop).InstallPath
            $nodeExe = Join-Path $installPath "node.exe"
            if (Test-Path $nodeExe) { return $nodeExe }
        } catch {}
    }

    # 4. nvm-windows shim locations
    $nvmHome = $env:NVM_HOME
    if ($nvmHome -and (Test-Path "$nvmHome\node.exe")) { return "$nvmHome\node.exe" }

    return $null
}

$nodeExe = Find-Node
if (-not $nodeExe) {
    Write-Host "ERROR: Node.js not found!" -ForegroundColor Red
    Write-Host "Install Node.js 18+ from https://nodejs.org" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# Add Node's directory to PATH for this session
$nodeDir = Split-Path $nodeExe
$env:PATH = "$nodeDir;$env:PATH"

$nodeVer = & $nodeExe --version
Write-Host "[OK] Node.js $nodeVer at $nodeExe" -ForegroundColor Green
Write-Host ""

# ── Step 1: npm install ──────────────────────────────────────────────────────
Write-Host "[1/3] Installing Node.js dependencies..." -ForegroundColor Yellow

$npmCmd = Join-Path $nodeDir "npm.cmd"
if (-not (Test-Path $npmCmd)) { $npmCmd = Join-Path $nodeDir "npm" }

try {
    & $npmCmd install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    Write-Host "[OK] Node dependencies installed." -ForegroundColor Green
} catch {
    Write-Host "ERROR: npm install failed — $_" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host ""

# ── Step 2: Python dependencies ──────────────────────────────────────────────
Write-Host "[2/3] Installing Python dependencies..." -ForegroundColor Yellow

$pyExe = $null
$pySearchPaths = @(
    "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe",
    "C:\Python312\python.exe",
    "C:\Python311\python.exe",
    "C:\Python310\python.exe"
)
foreach ($pyPath in $pySearchPaths) {
    if (Test-Path $pyPath) { $pyExe = $pyPath; break }
}
if (-not $pyExe) {
    foreach ($py in @("python", "python3", "py")) {
        $found = Get-Command $py -ErrorAction SilentlyContinue
        if ($found) { $pyExe = $found.Source; break }
    }
}

if ($pyExe) {
    try {
        & $pyExe -m pip install -r python\requirements.txt --quiet
        Write-Host "[OK] Python dependencies installed." -ForegroundColor Green
    } catch {
        Write-Host "WARNING: pip install failed. Python features may not work." -ForegroundColor Yellow
    }
    # Generate icons (PNG + ICO)
    Write-Host "    Generating icons..." -ForegroundColor Gray
    & $pyExe python\create_icon.py 2>$null
    # Generate icon.ico from icon.png for NSIS installer
    $icoScript = @'
from PIL import Image
img = Image.open("assets/icon.png")
img.save("assets/icon.ico", format="ICO", sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
print("icon.ico created")
'@
    $icoScript | & $pyExe - 2>$null
    if (Test-Path "assets\icon.ico") { Write-Host "[OK] icon.ico created." -ForegroundColor Green }
} else {
    Write-Host "WARNING: Python not found. Desktop automation features disabled." -ForegroundColor Yellow
    if (-not (Test-Path "assets\icon.ico")) {
        Write-Host "WARNING: assets\icon.ico missing — NSIS installer may fail." -ForegroundColor Red
    }
}
Write-Host ""

# ── Step 3: Build Windows installer ─────────────────────────────────────────
Write-Host "[3/3] Building Windows installer..." -ForegroundColor Yellow

# Disable code-signing (no certificate = dev build)
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"

# Prefer cli.js direct invocation (most reliable, no npm needed)
$ebCli = "node_modules\electron-builder\cli.js"
$ebCmd = "node_modules\.bin\electron-builder.cmd"

if (Test-Path $ebCli) {
    Write-Host "    Using electron-builder cli.js..." -ForegroundColor Gray
    & $nodeExe $ebCli --win
} elseif (Test-Path $ebCmd) {
    Write-Host "    Using electron-builder.cmd..." -ForegroundColor Gray
    & $ebCmd --win
} else {
    Write-Host "    Using npm run build:win..." -ForegroundColor Gray
    & $npmCmd run build:win
}

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Build failed! See output above." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# ── Done ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   BUILD COMPLETE!" -ForegroundColor Green
Write-Host "   Installer is in the 'dist' folder" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

if (Test-Path "dist") {
    Write-Host "Opening dist folder..." -ForegroundColor Gray
    Start-Process explorer.exe "dist"
}

Read-Host "Press Enter to close"
