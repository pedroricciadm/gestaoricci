@echo off
title Painel Grupo Ricci - porta 3500
cd /d "%~dp0"
echo Iniciando o Painel Grupo Ricci...
echo Acesse: http://localhost:3500
start "" http://localhost:3500
node server.js
pause
