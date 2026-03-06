@echo off
cd /d "%~dp0"

REM Try npm first (if Node.js is installed)
where npm >nul 2>&1
if %errorlevel% == 0 (
    echo Starting KAZI via npm...
    npm start
    goto :end
)

REM Fallback: use bundled electron.exe directly
set ELECTRON_EXE=%~dp0kazi-agent\node_modules\electron\dist\electron.exe
if not exist "%ELECTRON_EXE%" (
    echo ERROR: electron.exe not found. Please run SETUP.bat first.
    pause
    exit /b 1
)

echo Starting KAZI via electron directly...
"%ELECTRON_EXE%" "%~dp0"

:end
