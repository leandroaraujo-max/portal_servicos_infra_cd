# Script para limpar implementações antigas do Clasp Apps Script
# Mantém apenas a versão HEAD e a versão de Produção especificada

$ProductionID = "AKfycbw3RwP4dr5bx8N_yhFT4dDO0bHT10veT7UKa5RizCdLGRmp1ogEYqtIiqpE7ABbx-Ri"
$LogFile = "cleanup_log.txt"

# Ler arquivo de deployments gerado anteriormente
$deployments = Get-Content "deployments.txt"

foreach ($line in $deployments) {
    # Ignora linhas que não começam com "- "
    if ($line -match "^- ([^\s]+)") {
        $id = $matches[1]
        
        # Ignorar HEAD e a Produção
        if ($line -match "@HEAD") {
            Write-Host "Ignorando HEAD: $id" -ForegroundColor Cyan
            continue
        }
        
        if ($id -eq $ProductionID) {
            Write-Host "Ignorando Produção (KEEP): $id" -ForegroundColor Green
            continue
        }

        # Executar undeploy
        Write-Host "Removendo: $id" -ForegroundColor Yellow
        
        # Adiciona path para garantir funcionamento
        $env:Path += ";C:\Program Files\nodejs\;$env:APPDATA\npm"
        
        # Executa o comando e captura erro
        try {
            cmd /c "clasp undeploy $id"
            "Deleted: $id" | Out-File -Append $LogFile
        }
        catch {
            Write-Host "Erro ao remover $id" -ForegroundColor Red
        }
    }
}
Write-Host "Limpeza concluída." -ForegroundColor Green
