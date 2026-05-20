@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\mergepk-toolkit.ps1" %*
set ERR=%ERRORLEVEL%
if %ERR% neq 0 echo Failed: %ERR%
if "%~1"=="" pause
exit /b %ERR%
