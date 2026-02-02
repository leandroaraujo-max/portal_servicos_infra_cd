@echo off
:: ===========================================================
:: Launcher para Reset_users_Infra_cds.ps1
:: Executa o script PowerShell com elevação de administrador
:: ===========================================================

:: Verifica se está rodando como administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Solicitando elevacao de privilegios...
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

:: Define o diretório do script
cd /d "%~dp0"

:: Executa o script PowerShell com todas as políticas de execução necessárias
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Reset_users_Infra_cds.ps1"

:: Mantém a janela aberta em caso de erro
if %errorLevel% neq 0 (
    echo.
    echo Ocorreu um erro na execucao do script.
    pause
)