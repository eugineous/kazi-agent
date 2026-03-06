@echo off
echo ========================================
echo    KAZI - Building Windows Installer
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

echo [3/3] Building Windows installer...
call npm run build:win
if %errorlevel% neq 0 (
    echo ERROR: Build failed.
    pause
    exit /b 1
)
echo.

echo ========================================
echo    BUILD COMPLETE!
echo    Installer is in the 'dist' folder
echo ========================================
echo.
echo Opening dist folder...
explorer dist

pause
