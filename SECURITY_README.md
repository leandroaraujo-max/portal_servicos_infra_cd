# 🛡️ Segurança e Arquitetura - Manager Suite & Reset Users

Este documento detalha a arquitetura de segurança, fluxos de autenticação, permissões necessárias e protocolos de auditoria da solução de Gerenciamento de Usuários (Manager Suite) e Automação de Infraestrutura.

---

## 🏗️ Visão Geral da Arquitetura

O sistema opera em um modelo híbrido **Desktop-Cloud**, onde a interface de gerenciamento e o agente de execução residem na rede interna (On-Premise), enquanto a orquestração, fila e banco de dados residem na nuvem Google (Apps Script + Sheets + BigQuery).

### Componentes Principais

1.  **Frontend Desktop (`Manager_Suite.ps1`)**: Aplicação PowerShell/WinForms para analistas. Realiza consultas locais ao AD e remotas ao Google Apps Script.
    *   *Contexto de Execução:* Usuário logado na máquina (Analista).
    *   *Privilégios:* Requer RSAT instalado e permissões delegadas no AD.
2.  **Daemon de Automação (`Unified_AD_Daemon.ps1`)**: Serviço "Headless" que roda em servidor dedicado.
    *   *Contexto de Execução:* Conta de Serviço (Service Account) ou Admin.
    *   *Privilégios:* **Escrita no AD** (Reset de senha, Desbloqueio, Modificação de Grupos).
3.  **Backend Cloud (`AppsScript_Backend.js`)**: API RESTful e Web App hospedado no Google.
    *   *Função:* Orquestrador de filas, banco de dados (Sheets) e controle de aprovação via E-mail.
    *   *Autenticação:* Google OAuth 2.0.

---

## 🔐 Autenticação e Controle de Acesso

### 1. Autenticação na Interface Web (Frontend Vue.js)
*   **Método:** Google OAuth 2.0 (`Session.getActiveUser().getEmail()`).
*   **Restrição de Domínio:** Apenas e-mails dos domínios autorizados (`magazineluiza.com.br`, `luizalabs.com`, etc.) podem acessar.
*   **Validação Cruzada:** O e-mail logado é verificado contra uma lista de **Analistas Autorizados** na planilha de gestão (`Auth` e `Analistas`). Usuários inativos ou não cadastrados são bloqueados.

### 2. Autenticação e Permissões no Desktop (Manager Suite)
*   **Identidade:** Utiliza a sessão do Windows atual (`Get-ADUser $env:USERNAME`).
*   **RBAC (Role-Based Access Control):**
    *   O script assume que o usuário executando possui as permissões AD necessárias.
    *   Para ações críticas (Reset/Unlock), o script delega a execução para o **Daemon** via API, garantindo que o analista não precise de permissão de "Domain Admin", apenas de "Solicitante" no sistema.

### 3. Ações Remotas (Netskope/BitLocker)
*   **Ferramenta:** Utiliza `PsExec.exe` (Sysinternals).
*   **Risco:** Executa comandos como `SYSTEM` nas máquinas remotas.
*   **Mitigação:** Requer autenticação administrativa na rede para se conectar ao `ADMIN$` dos hosts alvo. O uso é restrito à rede interna.

---

## ✅ Fluxos de Aprovação Segura

Para ações sensíveis (Reset de Senha e Espelhamento de Permissões), o sistema implementa um fluxo de **One-Click Approval** via E-mail:

1.  **Solicitação:** Ocorre via Web App ou Daemon. O status inicial é `PENDENTE`.
2.  **Notificação:** O sistema busca o e-mail do Analista responsável na base de dados (`Analistas`) e envia um e-mail com links únicos gerados dinamicamente.
3.  **Validação:**
    *   O link contém: `?action=approve&id=<REQ_ID>&type=<TYPE>`.
    *   Ao clicar, o Backend valida se a solicitação ainda está pendente e atualiza para `APROVADO`.
4.  **Execução:** O Daemon (`Unified_AD_Daemon.ps1`) só processa itens da fila cujo status de aprovação seja explicitamente `APROVADO`.

> **⚠️ Nota de Segurança:** Os links de aprovação são "Bearer Tokens" temporários. A segurança depende do acesso exclusivo do analista à sua caixa de e-mail corporativa.

---

## 🛡️ Segurança de Dados e Infraestrutura

### Comunicação
*   **API Cloud:** Todo o tráfego entre a rede interna e o Google Apps Script ocorre via **HTTPS (TLS 1.2+)**.
*   **E-mail:** Envio via servidor SMTP interno (`smtpml.magazineluiza.intranet`), porta 25. O tráfego não sai para a internet pública.

### Armazenamento de Dados
*   **Nuvem (Google Sheets):**
    *   Armazena logs de auditoria, solicitações pendentes e cadastro de analistas.
    *   *Dados Sensíveis:* Nomes, E-mails, IDs internos. **Não armazena senhas em texto plano** (apenas hash, quando aplicável, ou senhas temporárias geradas no momento do envio e descartadas).
*   **Local (CSV):**
    *   `Log_Auditoria_Seguranca.csv`: Log redundante local de ações realizadas via Desktop.
    *   `Banco_Local_Cache.csv`: Cache de metadados para performance, sem dados críticos.

### Prevenção de Abusos
*   **Rate Limiting:** O Google Apps Script possui cotas nativas que previnem inundações de requisições.
*   **Sanitização:** Entradas SQL para o BigQuery são parametrizadas ou tratadas para evitar Injection simples (embora a confiança principal seja na rede interna).

---

## 🚨 Riscos Conhecidos e Recomendações (OpSec)

| Componente | Risco Identificado | Recomendação / Mitigação |
| :--- | :--- | :--- |
| **PsExec** | Execução remota como SYSTEM pode ser explorada se o binário for substituído ou interceptado. | Garantir que o diretório do script tenha permissões de escrita restritas. Validar hash do `PsExec.exe`. |
| **Aprovação** | Links de aprovação por e-mail permitem execução se o link vazar. | Instruir analistas a nunca compartilharem links de aprovação. Considerar expiração de link no futuro. |
| **API Token**| IDs das planilhas e Scripts estão hardcoded no código fonte. | O acesso às planilhas é restrito via permissões de compartilhamento do Google Drive (IAM). Manter lista de acesso restrita. |
| **Daemon** | O script Daemon roda com privilégios elevados no AD. | Rodar o Daemon em servidor seguro (Tier 0/1) com acesso físico/relógico restrito. Monitorar logs do Daemon `C:\ProgramData\ADResetTool\Logs`. |

---

## 📜 Logs e Auditoria

Todas as operações críticas geram rastro em três níveis:

1.  **Auditoria Nuvem (Planilha `Auditoria`):** Registro imutável contendo: Timestamp, Executor, Usuário Alvo, Ação, Status e E-mails de notificação.
2.  **Log Local (Arquivo `.log` e `.csv`):** Detalhamento técnico da execução do script Daemon e do Cliente Desktop.
3.  **BigQuery:** Consultas de leitura são registradas nos logs de acesso do GCP Project (`maga-bigdata`).

---

**Desenvolvido por:** Suporte Infra CDs - *Documentação Gerada Automaticamente por Agente IA*
