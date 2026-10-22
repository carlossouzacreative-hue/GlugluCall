@echo off
cd /d "%~dp0"
if not exist node_modules\nodemailer (
  echo Instalando dependencias...
  call npm install
)
echo.
echo Iniciando o servidor do GlugluCall...
node server.js
echo.
echo O servidor parou.
pause
