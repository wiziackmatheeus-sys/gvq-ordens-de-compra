// Opções fixas do formulário e valores iniciais dos cadastros.
// Raças, responsáveis, fazendas e origens podem ser editados na aba Cadastros
// (documentos listas/{nome} no Firestore); estes valores valem até lá.
export const TIPOS = ['Compra', 'Transferência', 'Trading'];
export const SEXOS = ['Machos', 'Fêmeas'];
export const PROPRIETARIOS = ['Grupo', 'Núcleo IQ'];
export const TRAVAS = ['Sim', 'Não'];
export const STATUS_OC = ['Em Andamento', 'Finalizado', 'Cancelado'];
export const VIABILIDADES = ['Pendente', 'Concluída'];

// OCs gravadas antes da coluna Viabilidade (inclusive as da planilha) têm status Pendente ou
// Aberto e nenhum campo viabilidade: Pendente era "aguardando viabilidade" e Aberto, "aprovada".
// Na próxima mudança feita pelo analista a OC já é gravada no formato novo.
export function normalizarOc(oc) {
    const antigo = oc.status === 'Pendente' || oc.status === 'Aberto';
    return {
        ...oc,
        status: antigo ? 'Em Andamento' : oc.status,
        viabilidade: oc.viabilidade ?? (oc.status === 'Pendente' ? 'Pendente' : 'Concluída')
    };
}

export const LISTAS_PADRAO = {
    racas: ['Aberdeen Angus', 'Anelorado', 'Cruzado', 'Nelore', 'Raças Europeias', 'Wagyu'],
    responsaveis: ['Alexsandro', 'Cristiano Fernandes', 'Leonaldo Gonçalves', 'Luan', 'Marcos Alexandre', 'Ragson Rodrigues', 'Rodrigo Fonseca', 'Select Sires'],
    // Fazendas de destino e outras origens: cadastros do sistema antigo (dados-iniciais/cadastros.json
    // do repositório gvq-ordens-compra): "destinos" → fazendas; "fazendas" + "fornecedores" → origens.
    fazendas: [
        'Acapu', 'Agropecuária Imperial', 'Água Limpa', 'Água Viva', 'Ana Paula', 'Apoena', 'Arvoredo', 'Bocaina',
        'Bom Pastor', 'Campo Belo', 'Cangaia', 'Canoas', 'Canta Galo', 'Celeiro', 'Colina Verde', 'Conforto I',
        'Conforto II', 'Corumbiara', 'Dom Bill', 'Flor da Mata', 'Garrafão', 'Grande Lago', 'Guaporé', 'HS',
        'Imburana', 'Imperial', 'Jaguar I', 'Jatiara', 'Lago do Pato', 'Mãe Preta', 'Manacá', 'Maravilha',
        'Maravilha do Araguaia', 'Mariká', 'Matinha', 'Mococa', 'Monte Castelo', 'Na Terra', 'Nossa Senhora Aparecida',
        'Nova Piratininga', 'Nova Veneza', 'Palmeiral', 'Palomino', 'Panorama', "Pau D'Alho", 'Pindorama', 'Planura',
        'Pontal', 'Rancho Fundo', 'Riacho Fundo', 'Rio Crixás', 'Rio Uruará', 'Rio Xingu', 'Santa Cruz', 'Santa Maria',
        'Santa Rosa', 'São Cristovão', 'São Félix', 'São Francisco', 'São João Batista', 'São Paulo', 'São Pedro',
        'Saracura', 'Sarandi', 'Sentinela', 'Toledo', 'Triunfo IV', 'União', 'Vale do Sonho', 'Vale Dourado'
    ],
    origens: [
        '3i - Integração', 'Adam/GO', 'Alcantara', 'Bem Te Vi', 'Brasília', 'Campo Belo GV', 'Campo Belo SP',
        'Conf. Corumbiara', 'Conf. Guaporé', 'Conf. Sarandi', 'CSAP Araguaína', 'CSAP Buritama', 'CSAP Ibitinga',
        'CSAP Rio Brilhante', 'CSAP Rolim de Moura', 'EPE 53', 'Fortaleza', 'Ibitinga Várzea', 'JBJ', 'Kiri',
        'São Francisco (Norberto)', 'Toca do Lobo', 'Três Corações', 'Venceslau',
        'Cristiano Fernandes', 'Danilo Carvalho', 'Gerisnaldo', 'Giovano', 'Juliano Rodrigues', 'Leonaldo Gonçalves',
        'Luciano Abrão', 'Marcelo Máximo', 'Marco Lúcio', 'Marcos Alexandre', 'Paulo Martins', 'Paulo Moreira',
        'Rennan Afonso', 'Ricardo Salles', 'Rodrigo Fonseca', 'Select Sires', 'Sérgio Caixeta', 'Timóteo'
    ]
};

export const NOMES_LISTAS = {
    fazendas: 'Fazendas de destino',
    origens: 'Outras origens (fornecedores, confinamentos)',
    racas: 'Raças',
    responsaveis: 'Responsáveis'
};

// Logins com cargo Master: só eles mudam o cargo e desativam outras pessoas.
// A mesma lista está em firestore.rules, que é o que vale de verdade.
export const MASTERS = ['matheus.souza', 'matheus.silveira'];

export const SITUACOES = {
    aguardando: { texto: 'Aguardando análise', classe: 'tag-indigo' },
    ajuste: { texto: 'Ajuste solicitado', classe: 'tag-alerta' },
    recusada: { texto: 'Recusada', classe: 'tag-perigo' },
    cancelada: { texto: 'Cancelada', classe: 'tag-perigo' },
    gerada: { texto: 'OC gerada', classe: 'tag-verde' }
};

// Status de OC em que o próprio solicitante ainda pode cancelar.
export const CANCELAVEL_PELO_SOLICITANTE = ['Em Andamento'];

export const DESCRICAO_STATUS_OC = {
    'Em Andamento': 'OC emitida, movimentação em andamento',
    Finalizado: 'movimentação concluída',
    Cancelado: 'OC cancelada'
};

export const CLASSE_STATUS_OC = { 'Em Andamento': 'tag-indigo', Finalizado: 'tag-verde', Cancelado: 'tag-perigo' };

export const DESCRICAO_VIABILIDADE = {
    Pendente: 'aguardando viabilidade comercial da BU',
    'Concluída': 'viabilidade comercial aprovada'
};

export const CLASSE_VIABILIDADE = { Pendente: 'tag-alerta', 'Concluída': 'tag-verde' };
