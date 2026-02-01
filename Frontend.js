/**
 * --- VERSÃO FRONTEND: 7.0 (Sincronização de Abas + Menus) ---
 * Configurações do Projeto do BigQuery
 * Substitua 'maga-bigdata' pelo ID do projeto no Google Cloud
 */
const PROJECT_ID = 'maga-bigdata';

// Lista de abas que NUNCA devem ser apagadas
const ABAS_PROTEGIDAS = ['BASE_FILIAIS', 'INFORMAÇÕES BASES'];

// Lista de Analistas para Validação
const LISTA_ANALISTAS = [
  "Adriano Machado", "Andson Santos", "Bruna Mueller", "Bruno Montilha", "Carlos Boaventura",
  "Caroline Lima", "Cassiano Teles", "Cleriston Rodrigues", "Didimo Silva", "Douglas Souza",
  "EdsonJunior", "Eduardo Silva", "Estermah Santos", "Fabiano  Rosa", "Francisco Regis",
  "Gabriel Namura", "Gabriel Lima", "Gabriel Villar", "Genison Santos", "Gladson Ferreira",
  "Glauber Vieira", "Helder Ito", "Iugner Santos", "Jacob Lima", "Jair Dias", "Jeronimo Moraes",
  "Kaio Vargas", "Karine Oliveira", "Leandro Araujo", "Leo Rezende", "Levi Dantas",
  "Lucas Silva", "Marcos Freiberger", "Matheus Sinflorio", "Max Weber", "MichelleRodrigues",
  "Naldimar Barros", "Paulo Bizzi", "Pedro Figur", "Rafaela Camecran", "Raiane  Aguiar",
  "Rodrigo Lima", "Rodrigo Costa", "Silas Ferreira", "Thiago Miranda", "Thiago Honorio",
  "Victor Pedroza", "Vinicius Silva", "Wesley Faria", "William Fernandes"
];

/**
 * Cria o menu personalizado ao abrir a planilha.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Relatórios BigQuery')
    .addItem('Sincronizar Filiais (BigQuery)', 'gerarRelatoriosPorFilial')
    .addSeparator()
    .addItem('🗑️ Excluir Abas Geradas', 'excluirAbasGeradas')
    .addToUi();
}

/**
 * NOVA FUNÇÃO: Exclui todas as abas que não são protegidas (reset da planilha)
 */
function excluirAbasGeradas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const todasAbas = ss.getSheets();

  const abasParaExcluir = todasAbas.filter(aba => !ABAS_PROTEGIDAS.includes(aba.getName()));

  if (abasParaExcluir.length === 0) {
    ui.alert("Não há abas geradas para excluir.");
    return;
  }

  const resposta = ui.alert(
    'Confirmação de Exclusão em Massa',
    `Atenção! Você está prestes a EXCLUIR PERMANENTEMENTE ${abasParaExcluir.length} abas geradas automaticamente.\n\nAs abas base (Base Filiais, Informações, Auditoria) NÃO serão afetadas.\n\nDeseja continuar?`,
    ui.ButtonSet.YES_NO
  );

  if (resposta !== ui.Button.YES) {
    return;
  }

  let contador = 0;
  abasParaExcluir.forEach(aba => {
    try {
      ss.deleteSheet(aba);
      contador++;
    } catch (e) {
      Logger.log(`Erro ao excluir ${aba.getName()}: ${e.message}`);
    }
  });

  ui.alert(`Limpeza concluída! ${contador} abas foram excluídas.`);
}

function gerarRelatoriosPorFilial() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let abaControle = ss.getSheetByName('INFORMAÇÕES BASES');
  if (!abaControle) {
    abaControle = ss.getSheetByName('BASE_FILIAIS');
  }
  if (!abaControle) {
    abaControle = ss.getActiveSheet();
  }

  Logger.log(`Lendo dados da aba: ${abaControle.getName()}`);

  const ultimaLinha = abaControle.getLastRow();
  if (ultimaLinha < 2) {
    SpreadsheetApp.getUi().alert(`A aba '${abaControle.getName()}' não tem dados suficientes.`);
    return;
  }

  const dados = abaControle.getRange(2, 1, ultimaLinha - 1, 3).getValues();

  // 1. IDENTIFICAR FILIAIS VÁLIDAS
  const filiaisValidas = new Map();

  dados.forEach(linha => {
    let idFilial = linha[0];
    let parteB = linha[1];
    let parteC = linha[2];

    if (idFilial) {
      let idString = String(idFilial).trim();
      let b = parteB ? String(parteB).trim() : "";
      let c = parteC ? String(parteC).trim() : "";

      let nomeAba = "";
      if (b && c) {
        nomeAba = `${b} - ${c}`;
      } else {
        nomeAba = b || c || idString;
      }

      filiaisValidas.set(nomeAba, idString);
    }
  });

  if (filiaisValidas.size === 0) {
    SpreadsheetApp.getUi().alert("Nenhuma filial válida encontrada.");
    return;
  }

  // 2. LIMPEZA
  const todasAbas = ss.getSheets();
  todasAbas.forEach(aba => {
    const nomeAba = aba.getName();
    if (!ABAS_PROTEGIDAS.includes(nomeAba) && !filiaisValidas.has(nomeAba)) {
      try {
        ss.deleteSheet(aba);
      } catch (e) {
        Logger.log(`Erro ao excluir aba ${nomeAba}: ${e.message}`);
      }
    }
  });

  // 3. CRIAÇÃO / ATUALIZAÇÃO
  filiaisValidas.forEach((idFilial, nomeAba) => {
    try {
      Logger.log(`Processando Filial(is): ${idFilial} | Aba: ${nomeAba}`);
      const resultado = executarQuery(idFilial);
      salvarDadosNaAba(ss, nomeAba, resultado);
    } catch (e) {
      Logger.log(`Erro ao processar filial ${idFilial}: ${e.message}`);
    }
  });

  SpreadsheetApp.getUi().alert(`Sincronização concluída! ${filiaisValidas.size} abas processadas.`);
}

/**
 * Monta e executa a query no BigQuery
 */
function executarQuery(filialId) {
  const sql = `
    SELECT
      t2.FILIAL,
      t2.ID,
      t2.NOME,
      t2.CARGO,
      t2.CENTRO_CUSTO,
      FORMAT_DATE('%d/%m/%Y', DATE(t2.DATA_ADMISSAO)) AS DATA_ADMISSAO,
      t2.SITUACAO,
      t1.email,
      t1.user_name
    FROM
      \`maga-bigdata.kirk.assignee\` AS t1
    INNER JOIN
      \`maga-bigdata.mlpap.mag_v_funcionarios_ativos\` AS t2
      ON t1.CUSTOM1 = CAST(t2.ID AS STRING)
    WHERE 
      t2.FILIAL IN (${filialId})
    QUALIFY ROW_NUMBER() OVER (PARTITION BY t2.ID ORDER BY LENGTH(t1.user_name) ASC) = 1
    ORDER BY
      t2.NOME asc
  `;

  const request = {
    query: sql,
    useLegacySql: false
  };

  let queryResults = BigQuery.Jobs.query(request, PROJECT_ID);
  const jobId = queryResults.jobReference.jobId;

  let sleepTimeMs = 500;
  while (!queryResults.jobComplete) {
    Utilities.sleep(sleepTimeMs);
    sleepTimeMs *= 2;
    queryResults = BigQuery.Jobs.getQueryResults(PROJECT_ID, jobId);
  }

  let rows = queryResults.rows;
  while (queryResults.pageToken) {
    queryResults = BigQuery.Jobs.getQueryResults(PROJECT_ID, jobId, {
      pageToken: queryResults.pageToken
    });
    if (queryResults.rows) {
      rows = rows.concat(queryResults.rows);
    }
  }

  if (!rows) {
    return { headers: [], data: [] };
  }

  const headers = queryResults.schema.fields.map(field => field.name);
  const data = rows.map(row => {
    return row.f.map(cell => cell.v);
  });

  return { headers: headers, data: data };
}

/**
 * Salva os dados na aba e formata (COM COLUNA VALIDADA DE ANALISTA)
 */
function salvarDadosNaAba(spreadsheet, nomeAba, resultado) {
  let sheet = spreadsheet.getSheetByName(nomeAba);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(nomeAba);
  } else {
    sheet.clear();
  }

  if (resultado.data.length === 0) {
    sheet.getRange(1, 1).setValue("Nenhum dado encontrado para esta seleção.");
    return;
  }

  const totalLinhas = resultado.data.length;
  // AUMENTAMOS O NÚMERO DE COLUNAS EM +2 (Resetar Senha? + Analista)
  const totalColunas = resultado.headers.length + 2;
  const rangeTotal = sheet.getRange(1, 1, totalLinhas + 1, totalColunas);

  // 1. Escreve Cabeçalhos 
  const toTitleCase = (str) => {
    if (!str) return "";
    return String(str).replace(/_/g, ' ').toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  let headersFormatados = resultado.headers.map(h => toTitleCase(h));
  let headers = [...headersFormatados, "Resetar Senha?", "Analista Responsável"];
  sheet.getRange(1, 1, 1, totalColunas).setValues([headers]);

  // 1.1 Transformar Dados (Caixa Alta -> Title Case para colunas específicas)
  const COLUNAS_TITLE_CASE = ['FILIAL', 'NOME', 'CARGO', 'CENTRO_CUSTO', 'SITUACAO'];
  const indicesParaConverter = [];
  resultado.headers.forEach((h, index) => {
    if (COLUNAS_TITLE_CASE.includes(h)) {
      indicesParaConverter.push(index);
    }
  });

  const dadosFormatados = resultado.data.map(linha => {
    return linha.map((celula, index) => {
      if (indicesParaConverter.includes(index) && celula) {
        return toTitleCase(celula);
      }
      return celula;
    });
  });

  // 2. Escreve Dados (Os dados originais vão até a antepenúltima coluna)
  sheet.getRange(2, 1, totalLinhas, resultado.headers.length).setValues(dadosFormatados);

  // 3. Validação de Dados: RESETAR SENHA? (Penúltima Coluna)
  const colIndexReset = totalColunas - 1;
  const rangeValidacaoReset = sheet.getRange(2, colIndexReset, totalLinhas, 1);
  const regraReset = SpreadsheetApp.newDataValidation()
    .requireValueInList(['SIM', 'NÃO'], true)
    .setAllowInvalid(false)
    .build();
  rangeValidacaoReset.setDataValidation(regraReset).setValue("NÃO");

  // 4. Validação de Dados: ANALISTA RESPONSÁVEL (Última Coluna)
  const colIndexAnalista = totalColunas;
  const rangeValidacaoAnalista = sheet.getRange(2, colIndexAnalista, totalLinhas, 1);
  const regraAnalista = SpreadsheetApp.newDataValidation()
    .requireValueInList(LISTA_ANALISTAS, true)
    .setAllowInvalid(false) // Bloqueia edição manual fora da lista
    .build();
  rangeValidacaoAnalista.setDataValidation(regraAnalista);

  // 5. Formatação Visual
  rangeTotal.setHorizontalAlignment("left");
  rangeTotal.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
  sheet.getRange(1, 1, 1, totalColunas).setFontWeight("bold");
  sheet.autoResizeColumns(1, totalColunas);

  // 6. Garantia Extra: Formata Coluna F como Texto/Data (Data Admissão)
  if (totalLinhas > 0) {
    sheet.getRange(2, 6, totalLinhas, 1).setNumberFormat("@");
  }
}
