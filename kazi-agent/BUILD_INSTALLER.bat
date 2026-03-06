@echo off
setlocal EnableDelayedExpansion
echo ========================================
echo    KAZI AGENT - Windows Installer Build
echo ========================================
echo.

cd /d "%~dp0"

:: ── Locate Node.js ──────────────────────────────────────────────────────────
set "NODE_EXE="
set "NPM_CMD="

:: Check if already in PATH
where node >nul 2>&1
if %errorlevel%==0 (
    for /f "delims=" %%i in ('where node') do set "NODE_EXE=%%i"
    for /f "delims=" %%i in ('where npm') do set "NPM_CMD=%%i"
    echo [OK] Found node in PATH: !NODE_EXE!
    goto :node_found
)

:: Search common install locations
set "SEARCH_PATHS=C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%LOCALAPPDATA%\Programs\nodejs;%APPDATA%\npm;%ProgramFiles%\nodejs"
for %%d in (%SEARCH_PATHS%) do (
    if exist "%%d\node.exe" (
        set "NODE_EXE=%%d\node.exe"
        set "NPM_CMD=%%d\npm.cmd"
        set "PATH=%%d;%PATH%"
        echo [OK] Found node at: %%d
        goto :node_found
    )
)

:: Search via registry
for /f "tokens=2*" %%a in ('reg query "HKLM\SOFTWARE\Node.js" /v InstallPath 2^>nul') do (
    if exist "%%b\node.exe" (
        set "NODE_EXE=%%b\node.exe"
        set "NPM_CMD=%%b\npm.cmd"
        set "PATH=%%b;%PATH%"
        echo [OK] Found node via registry: %%b
        goto :node_found
    )
)
for /f "tokens=2*" %%a in ('reg query "HKLM\SOFTWARE\WOW6432Node\Node.js" /v InstallPath 2^>nul') do (
    if exist "%%b\node.exe" (
        set "NODE_EXE=%%b\node.exe"
        set "NPM_CMD=%%b\npm.cmd"
        set "PATH=%%b;%PATH%"
        echo [OK] Found node via registry (WOW): %%b
        goto :node_found
    )
)

echo ERROR: Node.js not found!
echo Please install Node.js 18+ from https://nodejs.org
pause
exit /b 1

:node_found
echo [Node] Version: & "!NODE_EXE!" --version
echo.

:: ── Step 1: npm install ─────────────────────────────────────────────────────
echo [1/3] Installing Node.js dependencies...
if defined NPM_CMD (
    call "!NPM_CMD!" install
) else (
    "!NODE_EXE!" "!NODE_EXE!\..\node_modules\npm\bin\npm-cli.js" install
)
if %errorlevel% neq 0 (
    echo ERROR: npm install failed.
    pause
    exit /b 1
)
echo.

:: ── Step 2: Python dependencies ─────────────────────────────────────────────
echo [2/3] Installing Python dependencies...
set "PY_EXE="
:: Check PATH first
where python >nul 2>&1 && set "PY_EXE=python"
if not defined PY_EXE where python3 >nul 2>&1 && set "PY_EXE=python3"
if not defined PY_EXE where py >nul 2>&1 && set "PY_EXE=py"
:: Check common install locations
if not defined PY_EXE if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PY_EXE=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not defined PY_EXE if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set "PY_EXE=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
if not defined PY_EXE if exist "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" set "PY_EXE=%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
if not defined PY_EXE if exist "C:\Python312\python.exe" set "PY_EXE=C:\Python312\python.exe"

if defined PY_EXE (
    "!PY_EXE!" -m pip install -r python\requirements.txt --quiet
    if %errorlevel% neq 0 (
        echo WARNING: pip install failed. Python features may not work.
    ) else (
        echo [OK] Python dependencies installed.
    )
    :: Generate icons
    echo     Generating icons...
    "!PY_EXE!" python\create_icon.py >nul 2>&1
    :: Generate icon.ico for NSIS installer
    "!PY_EXE!" -c "from PIL import Image; img=Image.open('assets/icon.png'); img.save('assets/icon.ico',format='ICO',sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)]); print('[OK] icon.ico created')"
) else (
    echo WARNING: Python not found. Skipping Python dependencies.
    echo          Desktop automation features will not work without Python.
    if not exist "assets\icon.ico" (
        echo ERROR: assets\icon.ico is missing and Python is not available to create it.
        echo        Please run python python\create_icon.py manually first.
        pause
        exit /b 1
    )
)
echo.

:: ── Step 3: Build installer ─────────────────────────────────────────────────
echo [3/3] Building Windows installer with electron-builder...

:: Disable code signing (no certificate needed for dev builds)
set "CSC_IDENTITY_AUTO_DISCOVERY=false"

:: Try electron-builder cli.js directly (no npm needed, most reliable)
set "EB_CLI=node_modules\electron-builder\cli.js"
if exist "%EB_CLI%" (
    echo [OK] Using electron-builder cli.js...
    "!NODE_EXE!" "%EB_CLI%" --win
    goto :check_build
)

:: Try via .bin cmd
set "EB_CMD=node_modules\.bin\electron-builder.cmd"
if exist "%EB_CMD%" (
    echo [OK] Using electron-builder.cmd...
    call "%EB_CMD%" --win
    goto :check_build
)

:: Last resort: npm run build:win
if defined NPM_CMD (
    echo [OK] Using npm run build:win...
    call "!NPM_CMD!" run build:win
    goto :check_build
)

echo ERROR: electron-builder not found. Run 'npm install' first.
pause
exit /b 1

:check_build
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Build failed! Check the output above for details.
    pause
    exit /b 1
)

:: ── Done ────────────────────────────────────────────────────────────────────
echo.
echo ========================================
echo    BUILD COMPLETE!
echo    Installer is in the 'dist' folder
echo ========================================
echo.
if exist "dist" (
    echo Opening dist folder...
    explorer dist
)
pause
