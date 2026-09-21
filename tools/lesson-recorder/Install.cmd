@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -SetupDependencies -OpenPanel
if errorlevel 1 (
  echo.
  echo Installation failed. See the message above, then run Install.cmd again.
  pause
  exit /b 1
)
echo.
echo Installed. The setup wizard will open in your browser.
pause
