@echo off
echo ========================================
echo    KAZI - AI Desktop Agent Setup
echo ========================================
echo.

cd /d "%~dp0"

echo [1/3] Installing Node.js dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: npm install failed. Make sure Node.js is installed.
    pause
    exit /b 1
)
echo.

echo [2/3] Installing Python dependencies...
pip install -r python/requirements.txt
if %errorlevel% neq 0 (
    echo ERROR: pip install failed. Make sure Python is installed.
    pause
    exit /b 1
)
echo.

echo [3/3] Starting KAZI...
echo.
echo ========================================
echo    KAZI is starting!
echo    Hotkey: Ctrl+Shift+K to toggle
echo ========================================
echo.
npm start

pause
