@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "APP_EXECUTABLE=%SCRIPT_DIR%..\..\1Code.exe"
set "CLI_SCRIPT=%SCRIPT_DIR%..\app.asar\out\main\ripple-cli.js"
set "APP_ASAR=%SCRIPT_DIR%..\app.asar"

if exist "%APP_EXECUTABLE%" if exist "%APP_ASAR%" (
  set "ELECTRON_RUN_AS_NODE=1"
  "%APP_EXECUTABLE%" "%CLI_SCRIPT%" %*
  exit /b %ERRORLEVEL%
)

set "REPO_ROOT=%SCRIPT_DIR%..\.."
if exist "%REPO_ROOT%\scripts\ripple-cli.ts" (
  where bun >nul 2>nul
  if %ERRORLEVEL% equ 0 (
    bun "%REPO_ROOT%\scripts\ripple-cli.ts" %*
    exit /b %ERRORLEVEL%
  )
)

echo Ripple CLI requires the packaged app runtime or Bun in development. 1>&2
exit /b 1
