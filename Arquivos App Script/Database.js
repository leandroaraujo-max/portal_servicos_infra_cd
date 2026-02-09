/**
 * O Módulo de Conexão do Antigravity
 * Responsável por entregar a planilha certa dependendo do ambiente.
 */

// Chave da propriedade que vamos buscar nas configurações do Script
// Módulo de Conexão Resiliente (v1.6.3)

/**
 * Obtém a instância da Planilha (Database) ativa para este ambiente.
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet} A planilha conectada.
 */
function getDatabaseConnection() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const scriptId = ScriptApp.getScriptId();

  // IDs dos Projetos (Source of Truth)
  const ID_PROD = '1r3yVjaZ9-XzlPhZl9t0zd2pvH-PtN55KHKQTW_Nh0w00cbh-47q7yXOd';
  const isProd = (scriptId === ID_PROD) || (props['ENV'] === 'PROD');

  // v1.6.5: Segregação Automática Inteligente
  let dbUrl = isProd ? props['DB_URL_PROD'] : props['DB_URL_STAGING'];

  // Fail-safe: Se a URL específica não existir, tenta alternar
  if (!dbUrl) {
    dbUrl = props['DB_URL_PROD'] || props['DB_URL_STAGING'];
  }

  if (!dbUrl) {
    throw new Error("⛔ ERRO CRÍTICO: Configuração de DB_URL não encontrada para " + (isProd ? "PRODUÇÃO" : "STAGING"));
  }

  try {
    const ss = SpreadsheetApp.openByUrl(dbUrl);
    console.log("📡 Ambiente Identificado: " + (isProd ? "PRODUÇÃO" : "STAGING"));
    console.log("✅ Conectado ao DB: " + ss.getName());
    return ss;
  } catch (e) {
    throw new Error("⛔ ERRO DE CONEXÃO: " + e.message);
  }
}

/**
 * Retorna true se estiver rodando no script de Produção.
 */
function isProduction() {
  const scriptId = ScriptApp.getScriptId();
  const ID_PROD = '1r3yVjaZ9-XzlPhZl9t0zd2pvH-PtN55KHKQTW_Nh0w00cbh-47q7yXOd';
  return (scriptId === ID_PROD) || (PropertiesService.getScriptProperties().getProperty('ENV') === 'PROD');
}

// =========================================================================
// WMS CLUSTER & SERVERS CONFIG (v1.7.0)
// =========================================================================

// ID da Planilha de Servidores (Independente de ambiente, é a fonte da verdade da Infra)
const ID_PLANILHA_SERVIDORES = '1Towa_GmwdzyO8-P11h3fHQKsdIdWod5QNGXdgrQqVJI';

/**
 * Conecta na Planilha de Servidores/Infra.
 */
function getServersConnection() {
  return SpreadsheetApp.openById(ID_PLANILHA_SERVIDORES);
}

/**
 * Lê a lista de nós do Cluster WMS da Coluna C.
 * Retorna array de strings: ['SRV-WMS-01', 'SRV-WMS-02', ...]
 */
function getWmsClusterNodes() {
  // Cache de 1h para não estourar cota de leitura, já que infra muda pouco
  const cache = CacheService.getScriptCache();
  const cached = cache.get("WMS_CLUSTER_NODES");
  if (cached) return JSON.parse(cached);

  const ss = getServersConnection();
  // Assume a primeira aba ou uma específica. O usuário disse "a coluna C da planilha nova tem o nome de WMS Windows"
  let sheet = ss.getSheetByName("WMS Windows");
  if (!sheet) sheet = ss.getSheets()[0]; // Fallback para a primeira aba se o nome não for exato

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // Lê Coluna C (Índice 3) da linha 2 até o fim
  const data = sheet.getRange(2, 3, lastRow - 1, 1).getValues();

  // Filtra vazios e normaliza
  const nodes = data
    .flat()
    .filter(h => h && String(h).trim() !== "")
    .map(h => String(h).trim().toUpperCase());

  if (nodes.length > 0) {
    cache.put("WMS_CLUSTER_NODES", JSON.stringify(nodes), 3600); // Cache 1h
  }

  return nodes;
}

/**
 * v1.7.0: Retorna a lista de impressoras WMS do cache.
 * O cache é populado pelo Daemon via endpoint POST update_printer_cache.
 */
function getWmsPrinterCache() {
  const ss = getDatabaseConnection();
  const sheet = ss.getSheetByName('Cache_Impressoras');
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // Coluna B contém os nomes das impressoras
  const data = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  return data.flat().filter(p => p && String(p).trim() !== '');
}
