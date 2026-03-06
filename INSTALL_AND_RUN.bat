@echo off
echo ========================================
echo    KAZI - AI Desktop Agent Setup
echo ========================================
echo.

cd /d "%~dp0"

REM ── Step 1: Python ───────────────────────────────────────────
echo [1/3] Checking Python...
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo Python not found. Downloading and installing Python 3.12...
    powershell -Command "& { $url='https://www.python.org/ftp/python/3.12.9/python-3.12.9-amd64.exe'; $out='%TEMP%\python_installer.exe'; Invoke-WebRequest -Uri $url -OutFile $out; Start-Process -FilePath $out -Args '/quiet InstallAllUsers=0 PrependPath=1 Include_launcher=0' -Wait; Remove-Item $out }"
    echo Python installed. Refreshing PATH...
    call refreshenv >nul 2>&1
    set "PATH=%LOCALAPPDATA%\Programs\Python\Python312;%LOCALAPPDATA%\Programs\Python\Python312\Scripts;%PATH%"
)
python --version
echo.

REM ── Step 2: Python deps ───────────────────────────────────────
echo [2/3] Installing Python dependencies...
python -m pip install --upgrade pip >nul 2>&1
python -m pip install -r python\requirements.txt
if %errorlevel% neq 0 (
    echo ERROR: pip install failed.
    pause
    exit /b 1
)
echo Python deps installed.
echo.

REM ── Step 3: Electron / Node.js ────────────────────────────────
echo [3/3] Setting up Electron...

REM Check if we have the bundled electron.exe
set ELECTRON_EXE=%~dp0kazi-agent\node_modules\electron\dist\electron.exe

if exist "%ELECTRON_EXE%" (
    echo Bundled electron.exe found. No Node.js needed!
    goto :launch
)

REM Otherwise try npm
where npm >nul 2>&1
if %errorlevel% == 0 (
    echo Installing Node.js deps via npm...
    call npm install
    if %errorlevel% neq 0 (
        echo ERROR: npm install failed.
        pause
        exit /b 1
    )
    goto :launch_npm
)

REM Last resort: install Node.js
echo Node.js not found. Downloading Node.js LTS...
powershell -Command "& { $url='https://nodejs.org/dist/v22.13.1/node-v22.13.1-x64.msi'; $out='%TEMP%\node_installer.msi'; Invoke-WebRequest -Uri $url -OutFile $out; Start-Process msiexec.exe -Args \"/i $out /quiet /norestart\" -Wait; Remove-Item $out }"
echo Node.js installed. Run this script again.
pause
exit /b 0

:launch
echo.
echo ========================================
echo    KAZI is starting!
echo    Hotkey: Ctrl+Shift+K to toggle
echo    Close: right-click tray icon -^> Quit
echo ========================================
echo.
"%ELECTRON_EXE%" "%~dp0"
goto :end

:launch_npm
echo.
echo ========================================
echo    KAZI is starting!
echo    Hotkey: Ctrl+Shift+K to toggle
echo    Close: right-click tray icon -^> Quit
echo ========================================
echo.
npm start

:end
pause
