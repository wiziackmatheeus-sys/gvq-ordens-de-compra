// Carga inicial a partir dos arquivos do sistema antigo (pasta dados-iniciais do
// gvq-ordens-de-compra.zip): ocs-planilha.json e cadastros.json. Os arquivos ficam
// fora do repositório, que é público; o analista escolhe os dois no computador.
import { lerNumero } from './util.js';

const STATUS = ['Pendente', 'Aberto', 'Finalizado', 'Cancelado'];
const TIPOS = ['Compra', 'Transferência', 'Trading'];
const textoOuVazio = v => (v == null ? '' : String(v).trim());

// Na planilha, a coluna de observação de cada origem costuma trazer o R$/@ ("350").
function precoDaObs(obs) {
    const n = lerNumero(String(obs ?? '').replace(/^R\$\s*/i, '').replace(/\/@$/, ''));
    return Number.isFinite(n) && n > 0 && n < 10000 ? n : null;
}

export function converterOc(o) {
    const origens = (o.linhas || []).map(l => {
        const preco = precoDaObs(l.obs);
        return {
            origem: textoOuVazio(l.origem),
            quantidade: Number.isInteger(l.qtd) && l.qtd > 0 ? l.qtd : null,
            sequencia: textoOuVazio(l.sequencia),
            preco,
            obs: preco == null ? textoOuVazio(l.obs) : ''
        };
    });
    const soma = origens.reduce((t, l) => t + (l.quantidade || 0), 0);
    return {
        id: String(o.id).replace(/\//g, '-'),
        dados: {
            fonte: 'planilha',
            numero: Number(o.numeroBase),
            rotulo: textoOuVazio(o.numero),
            status: STATUS.includes(o.status) ? o.status : 'Finalizado',
            tipo: TIPOS.includes(o.operacao) ? o.operacao : '',
            sexo: textoOuVazio(o.sexo),
            raca: '',
            quantidade: Number.isInteger(o.qtdTotal) ? o.qtdTotal : (soma || null),
            origens,
            destino: textoOuVazio(o.destino),
            proprietario: textoOuVazio(o.proprietario),
            dataPrevista: /^\d{4}-\d{2}-\d{2}$/.test(o.data || '') ? o.data : '',
            trava: ['Sim', 'Não'].includes(o.trava) ? o.trava : '',
            alerta: textoOuVazio(o.alerta)
        }
    };
}

// Cadastros do sistema antigo → listas deste: "destinos" são as fazendas de destino;
// "fazendas" (outras fazendas e confinamentos) e "fornecedores" viram outras origens.
export function converterCadastros(c) {
    const unicos = l => [...new Set((l || []).map(textoOuVazio).filter(Boolean))];
    return {
        fazendas: unicos(c.destinos),
        origens: unicos([...(c.fazendas || []), ...(c.fornecedores || [])]),
        racas: unicos(c.racas),
        responsaveis: unicos(c.responsaveis)
    };
}

// ---------------------------------------------------------------------------
// Corte pela planilha de OCs (.xlsx, aba "Banco de Dados OC"): uma linha por origem, com as
// colunas Status da OC, OC, Qtd cb, Sexo, Operação, Proprietário, Origem, Destino,
// Sequência de OC, Data, Trava e Observação. Lida no navegador com a SheetJS.
// ---------------------------------------------------------------------------
let sheetJs = null;
const carregarSheetJs = () => sheetJs ??= new Promise((ok, erro) => {
    const s = Object.assign(document.createElement('script'), { src: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js' });
    s.onload = () => ok(window.XLSX);
    s.onerror = () => { sheetJs = null; erro(new Error('Não foi possível carregar o leitor de planilhas. Confira a internet.')); };
    document.head.appendChild(s);
});

const semAcento = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const valorPlanilha = v => { const t = textoOuVazio(v); return t === '-' ? '' : t; };
// Mesmo id da carga antiga: "1173 A" e "1179 (A)" viram "1173-A" e "1179-A".
const idDoRotulo = rotulo => rotulo.replace(/\s*\(?([A-Za-z])\)?\s*$/, '-$1').replace(/\//g, '-');
// "Travar Sim" / "Travar Não" → "Sim" / "Não".
const travaPlanilha = v => { const t = semAcento(v); return /\bsim\b/.test(t) ? 'Sim' : /\bnao\b/.test(t) ? 'Não' : ''; };
// Data do Excel (número de dias desde 1899-12-30) ou texto dd/mm/aaaa → aaaa-mm-dd.
function dataPlanilha(v) {
    if (typeof v === 'number' && v > 20000) return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
    const m = String(v ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

export async function lerPlanilhaOcs(arquivo) {
    const XLSX = await carregarSheetJs();
    const livro = XLSX.read(await arquivo.arrayBuffer(), { type: 'array' });
    const aba = livro.Sheets[livro.SheetNames.find(n => semAcento(n).includes('banco')) || livro.SheetNames[0]];
    const [cabecalho, ...linhas] = XLSX.utils.sheet_to_json(aba, { header: 1, raw: true, defval: '' });
    const coluna = nome => cabecalho.findIndex(c => semAcento(c).startsWith(nome));
    const col = {
        status: coluna('status'), oc: coluna('oc'), qtd: coluna('qtd'), sexo: coluna('sexo'), operacao: coluna('operacao'),
        proprietario: coluna('proprietario'), origem: coluna('origem'), destino: coluna('destino'), sequencia: coluna('sequencia'),
        data: coluna('data'), trava: coluna('trava'), obs: coluna('observacao')
    };
    if (col.oc < 0 || col.destino < 0) throw new Error('A planilha precisa das colunas "OC" e "Destino" na primeira linha.');

    // Linhas com o mesmo número, destino e operação são origens da mesma OC; se o número se
    // repete em outra movimentação, a segunda vira "N-2" (como na carga antiga), com alerta.
    const ocs = new Map(), porRotulo = new Map();
    for (const l of linhas) {
        const rotulo = valorPlanilha(l[col.oc]);
        if (!rotulo) continue;
        const destino = valorPlanilha(l[col.destino]), tipo = valorPlanilha(l[col.operacao]);
        const chave = `${rotulo}|${semAcento(destino)}|${semAcento(tipo)}`;
        if (!ocs.has(chave)) {
            const vezes = (porRotulo.get(rotulo) || 0) + 1;
            porRotulo.set(rotulo, vezes);
            const numero = parseInt(rotulo, 10);
            ocs.set(chave, {
                id: idDoRotulo(rotulo) + (vezes > 1 ? `-${vezes}` : ''), numero, rotulo,
                tipo: TIPOS.includes(tipo) ? tipo : '', sexo: valorPlanilha(l[col.sexo]), raca: '', destino,
                proprietario: valorPlanilha(l[col.proprietario]), dataPrevista: dataPlanilha(l[col.data]),
                trava: travaPlanilha(l[col.trava]),
                origens: []
            });
        }
        const qtd = Number(valorPlanilha(l[col.qtd]));
        const obs = valorPlanilha(l[col.obs]), preco = precoDaObs(obs);
        ocs.get(chave).origens.push({
            origem: valorPlanilha(l[col.origem]), quantidade: Number.isInteger(qtd) && qtd > 0 ? qtd : null,
            sequencia: valorPlanilha(l[col.sequencia]), preco, obs: preco == null ? obs : ''
        });
    }
    const lista = [...ocs.values()].filter(o => Number.isInteger(o.numero));
    for (const o of lista) {
        const soma = o.origens.reduce((t, x) => t + (x.quantidade || 0), 0);
        o.quantidade = soma || null;
        o.alerta = porRotulo.get(o.rotulo) > 1 ? `Número ${o.rotulo} aparece em ${porRotulo.get(o.rotulo)} movimentações diferentes na planilha` : '';
        o.origens = o.origens.slice(0, 50);
    }
    return lista;
}

export async function lerArquivosPlanilha(arquivos) {
    const resultado = { ocs: null, cadastros: null, erros: [] };
    for (const arquivo of arquivos) {
        try {
            const conteudo = JSON.parse(await arquivo.text());
            if (Array.isArray(conteudo) && conteudo.every(o => o && o.id != null && o.numeroBase != null)) resultado.ocs = conteudo.map(converterOc);
            else if (conteudo && Array.isArray(conteudo.destinos)) resultado.cadastros = converterCadastros(conteudo);
            else resultado.erros.push(`${arquivo.name}: formato não reconhecido`);
        } catch {
            resultado.erros.push(`${arquivo.name}: não é um arquivo JSON válido`);
        }
    }
    return resultado;
}
