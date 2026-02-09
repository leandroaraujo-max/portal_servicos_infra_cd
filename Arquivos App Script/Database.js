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

  // Tenta resolver a URL pela ordem de especificidade
  // Prioriza as novas chaves definidas pelo usuário
  const dbUrl = props['DB_URL_PROD'] || props['DB_URL_STAGING'];

  // 2. Fail-safe
  if (!dbUrl) {
    throw new Error("⛔ ERRO CRÍTICO: Nenhuma propriedade de conexão válida (DB_URL_PROD ou DB_URL_STAGING) encontrada.");
  }

  try {
    // 3. Conecta na planilha via URL
    const ss = SpreadsheetApp.openByUrl(dbUrl);
    // Tenta inferir ambiente pelo nome da chave ou propriedade ENV
    const isProd = (props['ENV'] === 'PROD') || (!!props['DB_URL_PROD']);

    console.log("✅ Conectado ao DB: " + ss.getName() + " [" + (isProd ? "PRODUÇÃO" : "HOMOLOGAÇÃO/DEV") + "]");
    return ss;
  } catch (e) {
    throw new Error("⛔ ERRO DE CONEXÃO: " + e.message);
  }
}

/**
 * Helper opcional para saber em qual ambiente estamos (baseado no ID ou outra flag)
 * Útil para condicionais de segurança (ex: não enviar emails reais em homolog)
 */
function isProduction() {
  const props = PropertiesService.getScriptProperties().getProperties();
  if (props['ENV'] === 'PROD') return true;
  if (props['DB_URL_PROD']) return true; // Infere PROD se a chave específica existir
  return false;
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
