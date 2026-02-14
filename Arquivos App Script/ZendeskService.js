/**
 * MÓDULO ZENDESK - TRÊS IDENTIDADES
 * Integrador: chatbot_helpdesk@magazineluiza.com.br
 * 
 * Este módulo gerencia a comunicação com a API do Zendesk para criar tickets
 * em nome do solicitante (Identidade 1), atribuídos ao analista (Identidade 2),
 * e fechados pelo robô/integrador (Identidade 3).
 */

const ZD_CONFIG = {
  subdomain: 'opsmagalu',
  // Recomendo salvar no Script Properties: PropertiesService.getScriptProperties().getProperty('ZD_TOKEN')
  token: PropertiesService.getScriptProperties().getProperty('ZD_TOKEN') || 'fQJk3eVT4S1PwaE3LvI1QhuO0wbPbZ1V40YNf6wC',
  email: 'chatbot_helpdesk@magazineluiza.com.br',
  form_id: 11340158223639,
  group_id: 1500003152142
};

/**
 * Abre um ticket no Zendesk.
 * @param {Object} dados - Objeto com os dados da solicitação.
 * @returns {number|null} ID do ticket criado ou null em caso de erro.
 */
function abrirTicketZendesk(dados) {
  const url = `https://${ZD_CONFIG.subdomain}.zendesk.com/api/v2/tickets.json`;
  const auth = Utilities.base64Encode(`${ZD_CONFIG.email}/token:${ZD_CONFIG.token}`);

  // Mapeamento automático de campos baseado no tipo de tarefa
  let principal = "acessos";
  let sub = dados.subcategoria || "acessos_desbloquei_usuario"; // Mantendo typo conforme chamado modelo
  let filialTag = dados.filial ? `tkf_filial_${String(dados.filial).replace(/\D/g, '')}` : ""; // Remove não-dígitos e formata com segurança

  // Ajuste fino de subcategoria
  if (!dados.subcategoria) {
    if (dados.tipo_tarefa === 'RESET') sub = "acessos_reset_de_senha";
    if (dados.tipo_tarefa === 'BITLOCKER') {
      principal = "suporte_infra_cds_tarefas_extras";
      sub = "acessos_bitlocker";
    }
    if (dados.tipo_tarefa === 'WMS_PRINT_CLEAN') {
      principal = "suporte_infra_cds_tarefas_extras";
      sub = "acessos_limpeza_de_fila_de_impressão";
    }
    // Fallback explícito para Desbloqueio
    if (dados.tipo_tarefa === 'DESBLOQUEIO_CONTA' || dados.tipo_tarefa === 'UNLOCK') {
      sub = "acessos_desbloquei_usuario";
    }
  }

  const payload = {
    "ticket": {
      "subject": `[PORTAL] ${dados.tipo_tarefa}: ${dados.valor}`,
      "comment": {
        "body": `Solicitação automatizada via Portal Automatos.\nTarefa: ${dados.tipo_tarefa}\nAlvo: ${dados.valor}`,
        "public": true
      },
      "requester": { "email": dados.email_solicitante }, // Identidade 1
      "assignee_email": dados.email_analista,           // Identidade 2
      "ticket_form_id": ZD_CONFIG.form_id,
      "group_id": ZD_CONFIG.group_id,
      "custom_fields": [
        { "id": 360045805373, "value": principal },
        { "id": 33294091278999, "value": sub },
        { "id": 1500005841581, "value": "out_squad_suporte_infra_cds" },
        { "id": 11340191255575, "value": dados.valor },
        { "id": 12297116742551, "value": "pendente_aprovacao" },
        { "id": 360046728773, "value": "status_done_nao" },
        // Novos campos mapeados do chamado modelo (Desbloqueio)
        { "id": 360049713894, "value": "infracd_solicitação_de_serviço" },
        { "id": 360046194913, "value": filialTag }
      ]
    }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Basic ' + auth },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const resObj = JSON.parse(response.getContentText());

    if (response.getResponseCode() === 201) {
      console.log(`[ZENDESK] Ticket criado: #${resObj.ticket.id}`);
      return resObj.ticket.id;
    }

    console.error("Erro Zendesk API (POST):", response.getContentText());
    let ticketId = `FALHA_ZD: ${response.getResponseCode()} - ${response.getContentText().substring(0, 100)}`; // Retorna erro visível

    // Se o retorno da função for uma string de erro (começa com FALHA_ZD), usa ela
    if (ticketId && String(ticketId).startsWith("FALHA_ZD")) {
      // Mantém o erro
    } else if (!ticketId) {
      ticketId = "FALHA_ZD: Retorno Nulo";
    }
    return ticketId; // Ensure the error is returned
  } catch (e) {
    console.error("Falha ao abrir ticket:", e.message);
    return `FALHA_ZD: EXCEPTION - ${e.message}`;
  }
}

/**
 * Fecha um ticket no Zendesk e envia mensagem de encerramento.
 * @param {number|string} ticketId - ID do ticket a ser fechado.
 * @param {string} nomeSolicitante - Nome do solicitante para personalização da mensagem.
 */
function fecharTicketZendesk(ticketId, nomeSolicitante) {
  if (!ticketId) return;

  const url = `https://${ZD_CONFIG.subdomain}.zendesk.com/api/v2/tickets/${ticketId}.json`;
  const auth = Utilities.base64Encode(`${ZD_CONFIG.email}/token:${ZD_CONFIG.token}`);

  const mensagem = `Olá ${nomeSolicitante}, solicitação resolvida pelo nosso Agente Virtual. Esperamos ter ajudado!\n\n` +
    `Sua avaliação sobre nosso atendimento nos ajuda a melhorar, por isso agradecemos se puder deixar a sua opinião na avaliação do CSAT que irá receber em seu e-mail.\n\n` +
    `Agradeço desde já sua colaboração!\nAtenciosamente,\nIntegrador Help Desk`;

  const payload = {
    "ticket": {
      "status": "solved",
      "comment": { "body": mensagem, "public": true }
    }
  };

  const options = {
    method: 'put',
    contentType: 'application/json',
    headers: { 'Authorization': 'Basic ' + auth },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    UrlFetchApp.fetch(url, options);
    console.log(`[ZENDESK] Ticket #${ticketId} resolvido pelo Integrador.`);
  } catch (e) {
    console.error(`[ZENDESK] Erro ao fechar ticket #${ticketId}: ${e.message}`);
  }
}
