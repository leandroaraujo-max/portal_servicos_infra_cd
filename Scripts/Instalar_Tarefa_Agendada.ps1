# ==============================================================================
# SCRIPT DE INSTALAÇÃO DA TAREFA AGENDADA (SYNC ESPELHO AD)
# ==============================================================================
# Execute este script COMO ADMINISTRADOR no servidor onde o script foi salvo.

$TaskName = "AD_Sync_Espelho_Agent"
$ScriptPath = "$PSScriptRoot\Sync_Espelho_AD.ps1"
$Description = "Agente de sincronização para espelhamento de usuários (Google Sheets <-> Active Directory Local)"

# Verifica se o script existe
if (-not (Test-Path $ScriptPath)) {
    Write-Host "ERRO: Script não encontrado em: $ScriptPath" -ForegroundColor Red
    exit
}

# Caminho do PowerShell
$PowershellPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$Arguments = "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`""

# Ação da Tarefa
$Action = New-ScheduledTaskAction -Execute $PowershellPath -Argument $Arguments

# Disparador (Trigger) - Iniciar diariamente e repetir a cada 1 minuto
$Trigger = New-ScheduledTaskTrigger -Daily -At (Get-Date).Date.AddHours(6) # Começa as 06:00 (ou agora se já passou)
$Trigger.Repetition = New-ScheduledTaskTriggerRepetition -Interval (New-TimeSpan -Minutes 1) -Duration (New-TimeSpan -Days 3650) # Repete infinitamente (10 anos)

# Configurações da Tarefa
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)

# Principal (Usuário que executa - SYSTEM para garantir permissões locais, ou mude para Service Account específica)
# Recomendado: Rodar como SYSTEM ou uma conta de serviço com permissão de leitura no AD
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount

# Cria/Atualiza a Tarefa
try {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Description $Description
    Write-Host "SUCESSO: Tarefa '$TaskName' criada e agendada para rodar a cada 1 minuto." -ForegroundColor Green
    Write-Host "Script Alvo: $ScriptPath" -ForegroundColor Cyan
} catch {
    Write-Host "ERRO ao criar tarefa: $($_.Exception.Message)" -ForegroundColor Red
}
