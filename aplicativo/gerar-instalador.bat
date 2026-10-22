@echo off
cd /d "%~dp0"
call npm install
call npm run dist
echo.
echo Pronto! O instalador esta na pasta dist\
pause
