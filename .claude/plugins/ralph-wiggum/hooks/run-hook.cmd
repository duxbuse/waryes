@echo off
setlocal

:: Ralph Wiggum Stop Hook Wrapper
:: Finds node.exe and runs the stop-hook.js script

set "SCRIPT_DIR=%~dp0"
set "HOOK_SCRIPT=%SCRIPT_DIR%stop-hook.js"

:: Method 1: Try node directly (if in PATH)
where node >nul 2>&1
if %errorlevel% equ 0 (
    node "%HOOK_SCRIPT%"
    exit /b %errorlevel%
)

:: Method 2: Check common installation paths individually
if exist "C:\Program Files\nodejs\node.exe" (
    "C:\Program Files\nodejs\node.exe" "%HOOK_SCRIPT%"
    exit /b %errorlevel%
)

if exist "C:\Program Files (x86)\nodejs\node.exe" (
    "C:\Program Files (x86)\nodejs\node.exe" "%HOOK_SCRIPT%"
    exit /b %errorlevel%
)

if exist "%LOCALAPPDATA%\Programs\node\node.exe" (
    "%LOCALAPPDATA%\Programs\node\node.exe" "%HOOK_SCRIPT%"
    exit /b %errorlevel%
)

if exist "%APPDATA%\npm\node.exe" (
    "%APPDATA%\npm\node.exe" "%HOOK_SCRIPT%"
    exit /b %errorlevel%
)

if exist "%USERPROFILE%\scoop\apps\nodejs\current\node.exe" (
    "%USERPROFILE%\scoop\apps\nodejs\current\node.exe" "%HOOK_SCRIPT%"
    exit /b %errorlevel%
)

if exist "%USERPROFILE%\scoop\apps\nodejs-lts\current\node.exe" (
    "%USERPROFILE%\scoop\apps\nodejs-lts\current\node.exe" "%HOOK_SCRIPT%"
    exit /b %errorlevel%
)

:: Method 3: Try NVM paths
if defined NVM_HOME (
    if exist "%NVM_HOME%\nodejs\node.exe" (
        "%NVM_HOME%\nodejs\node.exe" "%HOOK_SCRIPT%"
        exit /b %errorlevel%
    )
)

:: Method 4: Try to find via registry (Node.js installer sets this)
for /f "tokens=2*" %%a in ('reg query "HKLM\SOFTWARE\Node.js" /v InstallPath 2^>nul') do (
    if exist "%%b\node.exe" (
        "%%b\node.exe" "%HOOK_SCRIPT%"
        exit /b %errorlevel%
    )
)

:: Failed to find node
echo Ralph loop error: Could not find node.exe >&2
echo Please ensure Node.js is installed and in your PATH >&2
exit /b 1
