@echo off
REM Backup do banco do Sistema de Gestao Ricci.
REM Agende no Agendador de Tarefas do Windows (diario, ex.: 23h00) apontando para este .bat.
cd /d "%~dp0"
node scripts\backup.js >> data\backups\backup.log 2>&1
