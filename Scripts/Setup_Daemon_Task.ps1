# ==============================================================================
# MAGALU - SETUP DAEMON TASK v1.0
# ==============================================================================
# Este script configura o Unified_AD_Daemon para rodar como Tarefa Agendada
# garantindo execução 24/7 independente de usuário logado.
# ==============================================================================

$TaskName = "Magalu_AD_Daemon"
$ScriptPath = "c:\Projetos\Reset Users - Suporte Infra CDs\Scripts\Unified_AD_Daemon.ps1"
$Description = "Serviço de Processamento de Resets, Desbloqueios e Espelhos de AD - Suporte Infra CDs"

# 1. Preparar Ação (Executar PowerShell oculto)
$Action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`""

# 2. Preparar Trigger (Ao Iniciar o Sistema)
$Trigger = New-ScheduledTaskTrigger -AtStartup

# 3. Preparar Configurações (Resiliência)
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 5)

# 4. Registrar a Tarefa (Rodar como Usuário Local para garantir permissões AD se necessário, ou SYSTEM)
# Nota: Para interagir com AD, o usuário da tarefa deve ter permissão no domínio.
Write-Host "Configurando tarefa agendada '$TaskName'..." -ForegroundColor Cyan

try {
    # Remove tarefa antiga se existir
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    
    # Registra a nova tarefa como SYSTEM para rodar Full Time
    Register-ScheduledTask -TaskName $TaskName `
        -Action $Action `
        -Trigger $Trigger `
        -Settings $Settings `
        -User "SYSTEM" `
        -RunLevel Highest `
        -Description $Description

    Write-Host "Sucesso! A tarefa '$TaskName' foi criada e iniciará com o Windows." -ForegroundColor Green
    Write-Host "Para iniciar agora manualmente: Start-ScheduledTask -TaskName '$TaskName'" -ForegroundColor Yellow
}
catch {
    Write-Host "Erro ao configurar tarefa: $_" -ForegroundColor Red
}
