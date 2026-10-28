import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    collection, doc, getDoc, onSnapshot, query, where, addDoc, updateDoc, setDoc, runTransaction, writeBatch, serverTimestamp, deleteField
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { TIPOS, SEXOS, PROPRIETARIOS, TRAVAS, STATUS_OC, LISTAS_PADRAO, NOMES_LISTAS, SITUACOES, CLASSE_STATUS_OC, DESCRICAO_STATUS_OC, MASTERS, CANCELAVEL_PELO_SOLICITANTE,
    VIABILIDADES, DESCRICAO_VIABILIDADE, CLASSE_VIABILIDADE, normalizarOc } from "./listas.js";
import { lerArquivosPlanilha } from "./importar.js";
import { escapar, formatarData, formatarNumero, formatarPreco, lerNumero, hojeIso, compararNomes, contemTermos } from "./util.js";

const $ = id => document.getElementById(id);
const estado = {
    usuario: null,
    listas: { ...LISTAS_PADRAO },
    minhas: [], minhasOcs: new Map(),
    analise: [], ocs: [], usuarios: [],
    editando: null,      // solicitação em correção (status "ajuste")
    analisando: null     // solicitação aberta no diálogo de análise
};
const cancelamentos = [];
const ehMaster = () => MASTERS.includes(estado.usuario?.login);
// O Master faz tudo o que o analista faz, e só ele mexe nos usuários.
const ehAnalista = () => estado.usuario?.perfil === 'analista' || ehMaster();
const nomeCargo = u => MASTERS.includes(u.login) ? 'Master' : u.perfil === 'analista' ? 'Analista' : 'Solicitante';
const dataDe = ts => ts?.toDate ? ts.toDate().toLocaleDateString('sv-SE') : '';
const tag = (texto, classe = '') => `<span class="tag ${classe}">${escapar(texto)}</span>`;
const vazio = (tbody, colunas, texto) => { $(tbody).innerHTML = `<tr><td class="celula-vazia" colspan="${colunas}">${escapar(texto)}</td></tr>`; };

function falhar(error) {
    console.error(error);
    if (error?.code === 'permission-denied') {
        alert('Seu acesso mudou ou expirou. Entre novamente.');
        sair();
    }
}

async function sair() {
    cancelamentos.splice(0).forEach(c => c());
    await signOut(auth).catch(() => {});
    location.href = '../index.html';
}
$('btn-sair').onclick = sair;

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------
if (!auth) location.href = '../index.html';
else onAuthStateChanged(auth, async user => {
    if (!user) { location.href = '../index.html'; return; }
    try {
        const login = user.email.split('@')[0];
        const snap = await getDoc(doc(db, 'usuarios', login));
        const perfil = snap.exists() ? snap.data() : null;
        if (!perfil || perfil.uid !== user.uid || !['solicitante', 'analista'].includes(perfil.perfil) || perfil.ativo === false) {
            alert('Acesso não liberado. Fale com o analista.');
            return sair();
        }
        estado.usuario = { ...perfil, login, uid: user.uid };
        iniciar();
    } catch (error) {
        console.error(error);
        alert('Não foi possível verificar seu acesso. Entre novamente.');
        sair();
    }
});

function iniciar() {
    const u = estado.usuario;
    $('nome-usuario').textContent = u.nome;
    $('perfil-usuario').textContent = nomeCargo(u);
    document.querySelectorAll('[data-analista]').forEach(el => { el.hidden = !ehAnalista(); });
    document.querySelectorAll('[data-master]').forEach(el => { el.hidden = !ehMaster(); });
    document.querySelector('.abas').hidden = false;
    $('carregando').hidden = true;

    montarFormulario();
    cancelamentos.push(onSnapshot(collection(db, 'listas'), snap => {
        snap.forEach(d => { if (Array.isArray(d.data().itens)) estado.listas[d.id] = d.data().itens; });
        atualizarListas();
    }, falhar));
    cancelamentos.push(onSnapshot(query(collection(db, 'solicitacoes'), where('criadoPor', '==', u.login)), snap => {
        estado.minhas =snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderMinhas();
    }, falhar));
    cancelamentos.push(onSnapshot(query(collection(db, 'ocs'), where('criadoPor', '==', u.login)), snap => {
        estado.minhasOcs = new Map(snap.docs.map(d => [d.data().numero, normalizarOc(d.data())]));
        renderMinhas();
    }, falhar));

    if (ehAnalista()) {
        cancelamentos.push(onSnapshot(query(collection(db, 'solicitacoes'), where('status', '==', 'aguardando')), snap => {
            estado.analise = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderAnalise();
        }, falhar));
        cancelamentos.push(onSnapshot(collection(db, 'ocs'), snap => {
            estado.ocs = snap.docs.map(d => normalizarOc({ id: d.id, ...d.data() }));
            renderOcs();
        }, falhar));
        if (ehMaster()) {
            cancelamentos.push(onSnapshot(collection(db, 'usuarios'), snap => {
                estado.usuarios = snap.docs.map(d => ({ ...d.data(), login: d.id }));
                renderUsuarios();
            }, falhar));
        }
        montarOcs();
        montarCadastros();
    }

    const inicial = location.hash.slice(1);
    mostrarAba(document.querySelector(`.aba[data-aba="${inicial}"]:not([hidden])`) ? inicial : (ehAnalista() ? 'analise' : 'nova'));
}

// ---------------------------------------------------------------------------
// Abas
// ---------------------------------------------------------------------------
function mostrarAba(nome) {
    document.querySelectorAll('.aba').forEach(b => {
        const ativa = b.dataset.aba === nome;
        b.classList.toggle('ativa', ativa);
        b.setAttribute('aria-current', ativa ? 'page' : 'false');
    });
    document.querySelectorAll('.painel').forEach(p => { p.hidden = p.id !== 'aba-' + nome; });
    history.replaceState(null, '', '#' + nome);
}
document.querySelectorAll('.aba').forEach(b => b.addEventListener('click', () => mostrarAba(b.dataset.aba)));

// Grupo de botões de escolha única (Tipo, Sexo, Proprietário, Trava)
function criarOpcoes(container, valores, aoMudar = () => {}) {
    container.innerHTML = valores.map(v => `<button type="button" class="opcao" role="radio" aria-checked="false" data-valor="${escapar(v)}">${escapar(v)}</button>`).join('');
    const definir = valor => {
        container.dataset.valor = valor || '';
        container.querySelectorAll('.opcao').forEach(b => b.setAttribute('aria-checked', String(b.dataset.valor === valor)));
        container.classList.remove('campo-invalido');
        aoMudar(valor);
    };
    container.querySelectorAll('.opcao').forEach(b => b.addEventListener('click', () => definir(b.dataset.valor)));
    container.definir = definir;
    definir('');
}

function preencherSelect(select, itens, rotuloVazio = 'Selecione...') {
    const atual = select.value;
    select.innerHTML = `<option value="">${rotuloVazio}</option>` + itens.map(i => `<option>${escapar(i)}</option>`).join('');
    if (atual && !itens.includes(atual)) select.insertAdjacentHTML('beforeend', `<option>${escapar(atual)}</option>`);
    select.value = atual;
}

function atualizarListas() {
    const ordenar = l => [...l].sort(compararNomes);
    preencherSelect($('f-raca'), ordenar(estado.listas.racas));
    preencherSelect($('f-responsavel'), ordenar(estado.listas.responsaveis));
    // Origem pode ser fornecedor, outra fazenda ou uma das fazendas de destino (transferência).
    const origens = [...new Set([...estado.listas.origens, ...estado.listas.fazendas])];
    $('lista-origens').innerHTML = ordenar(origens).map(i => `<option value="${escapar(i)}">`).join('');
    $('lista-fazendas').innerHTML = ordenar(estado.listas.fazendas).map(i => `<option value="${escapar(i)}">`).join('');
    if (ehAnalista()) renderCadastros();
}

// ---------------------------------------------------------------------------
// Nova solicitação / correção
// ---------------------------------------------------------------------------
const CAMPOS_TEXTO = ['raca', 'origem', 'destino', 'dataPrevista', 'solicitante', 'responsavel', 'telefone', 'observacao'];
const campo = nome => $('form-solicitacao').elements[nome];

function montarFormulario() {
    criarOpcoes($('f-tipo'), TIPOS, valor => {
        $('grupo-preco').hidden = valor !== 'Compra';
        if (valor !== 'Compra') $('f-preco').value = '';
    });
    criarOpcoes($('f-sexo'), SEXOS);
    criarOpcoes($('f-proprietario'), PROPRIETARIOS);
    $('f-solicitante').value = estado.usuario.nome;
    $('form-solicitacao').addEventListener('submit', enviarSolicitacao);
    $('btn-cancelar-ajuste').onclick = limparFormulario;
}

function limparFormulario() {
    estado.editando = null;
    $('form-solicitacao').reset();
    ['f-tipo', 'f-sexo', 'f-proprietario'].forEach(id => $(id).definir(''));
    $('f-solicitante').value = estado.usuario.nome;
    $('titulo-form').textContent = 'Nova solicitação';
    $('btn-enviar').textContent = 'Enviar solicitação';
    $('btn-cancelar-ajuste').hidden = true;
    $('aviso-ajuste').hidden = true;
    $('erro-solicitacao').textContent = '';
    document.querySelectorAll('.campo-invalido').forEach(el => el.classList.remove('campo-invalido'));
}

function editarSolicitacao(id) {
    const s = estado.minhas.find(x => x.id === id);
    if (!s) return;
    limparFormulario();
    estado.editando = s;
    $('f-tipo').definir(s.tipo);
    $('f-sexo').definir(s.sexo);
    $('f-proprietario').definir(s.proprietario);
    CAMPOS_TEXTO.forEach(n => { campo(n).value = s[n] ?? ''; });
    campo('quantidade').value = s.quantidade ?? '';
    $('f-preco').value = s.preco != null ? formatarPreco(s.preco) : '';
    $('titulo-form').textContent = 'Corrigir solicitação';
    $('btn-enviar').textContent = 'Reenviar para análise';
    $('btn-cancelar-ajuste').hidden = false;
    $('aviso-ajuste').hidden = false;
    $('aviso-ajuste').innerHTML = `<div><strong>O analista pediu ajuste:</strong> ${escapar(s.mensagemAnalista || '')}</div>`;
    mostrarAba('nova');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function lerFormulario() {
    const erros = [];
    const marcar = (el, ok) => { el.classList.toggle('campo-invalido', !ok); if (!ok) erros.push(el); };
    const dados = {
        tipo: $('f-tipo').dataset.valor, sexo: $('f-sexo').dataset.valor, proprietario: $('f-proprietario').dataset.valor
    };
    marcar($('f-tipo'), TIPOS.includes(dados.tipo));
    marcar($('f-sexo'), SEXOS.includes(dados.sexo));
    marcar($('f-proprietario'), PROPRIETARIOS.includes(dados.proprietario));
    CAMPOS_TEXTO.forEach(n => { dados[n] = campo(n).value.trim(); });
    ['raca', 'origem', 'destino', 'dataPrevista', 'solicitante', 'responsavel'].forEach(n => marcar(campo(n), dados[n].length > 0));
    const quantidade = Number(campo('quantidade').value);
    marcar(campo('quantidade'), Number.isInteger(quantidade) && quantidade > 0);
    dados.quantidade = quantidade;
    dados.preco = null;
    if (dados.tipo === 'Compra') {
        const preco = lerNumero($('f-preco').value);
        marcar($('f-preco'), preco !== null && preco > 0);
        dados.preco = preco;
    }
    return { dados, erros };
}

let enviando = false;
async function enviarSolicitacao(e) {
    e.preventDefault();
    if (enviando) return;
    const { dados, erros } = lerFormulario();
    if (erros.length) {
        const nomes = erros.map(el => document.querySelector(`label[for="${el.id}"]`)?.textContent.replace('*', '').trim()).filter(Boolean);
        $('erro-solicitacao').textContent = `Preencha os campos obrigatórios: ${nomes.join(', ')}.`;
        erros[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
        erros[0].focus?.();
        return;
    }
    $('erro-solicitacao').textContent = '';
    enviando = true;
    $('btn-enviar').disabled = true;
    try {
        if (estado.editando) {
            await updateDoc(doc(db, 'solicitacoes', estado.editando.id), { ...dados, status: 'aguardando', atualizadoEm: serverTimestamp() });
        } else {
            await addDoc(collection(db, 'solicitacoes'), {
                ...dados, status: 'aguardando', mensagemAnalista: '',
                criadoPor: estado.usuario.login, criadoPorNome: estado.usuario.nome,
                criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp()
            });
        }
        limparFormulario();
        mostrarAba('minhas');
    } catch (error) {
        console.error(error);
        $('erro-solicitacao').textContent = 'Não foi possível enviar. Confira a conexão e tente novamente.';
    } finally {
        enviando = false;
        $('btn-enviar').disabled = false;
    }
}

// ---------------------------------------------------------------------------
// Minhas solicitações
// ---------------------------------------------------------------------------
function renderMinhas() {
    const lista = [...estado.minhas].sort((a, b) => (b.criadoEm?.seconds ?? Infinity) - (a.criadoEm?.seconds ?? Infinity));
    if (!lista.length) return vazio('tbody-minhas', 9, 'Você ainda não enviou solicitações.');
    $('tbody-minhas').innerHTML = lista.map(s => {
        const situacao = SITUACOES[s.status] || { texto: s.status, classe: '' };
        const oc = s.ocNumero ? estado.minhasOcs.get(s.ocNumero) : null;
        const detalhe = ['ajuste', 'recusada', 'cancelada'].includes(s.status) && s.mensagemAnalista
            ? `<span class="motivo">${escapar(s.mensagemAnalista)}</span>` : '';
        return `<tr>
            <td class="col-data"><strong>${formatarData(dataDe(s.criadoEm))}</strong></td>
            <td>${escapar(s.tipo)}</td>
            <td class="col-num">${formatarNumero(s.quantidade)}</td>
            <td>${escapar(s.origem)} → ${escapar(s.destino)}</td>
            <td>${tag(situacao.texto, situacao.classe)}${detalhe}</td>
            <td>${s.ocNumero ? `<strong>${s.ocNumero}</strong>` : '—'}</td>
            <td>${oc ? tag(oc.status, CLASSE_STATUS_OC[oc.status]) + `<span class="motivo">${escapar(DESCRICAO_STATUS_OC[oc.status] || '')}</span>` : '—'}</td>
            <td>${oc ? tag(oc.viabilidade, CLASSE_VIABILIDADE[oc.viabilidade]) : '—'}</td>
            <td><div class="acoes-linha">${s.status === 'ajuste' ? `<button class="btn btn-primario btn-sm" data-corrigir="${s.id}">Corrigir</button>` : ''}${
                ['aguardando', 'ajuste'].includes(s.status) ? `<button class="btn btn-perigo btn-sm" data-cancelar-sol="${s.id}">Cancelar</button>` : ''}${
                oc && CANCELAVEL_PELO_SOLICITANTE.includes(oc.status) ? `<button class="btn btn-perigo btn-sm" data-cancelar-oc="${oc.numero}">Cancelar OC</button>` : ''}</div></td>
        </tr>`;
    }).join('');
    $('tbody-minhas').querySelectorAll('[data-corrigir]').forEach(b => b.onclick = () => editarSolicitacao(b.dataset.corrigir));
    $('tbody-minhas').querySelectorAll('[data-cancelar-sol]').forEach(b => b.onclick = () => cancelarSolicitacao(b.dataset.cancelarSol));
    $('tbody-minhas').querySelectorAll('[data-cancelar-oc]').forEach(b => b.onclick = () => cancelarMinhaOc(Number(b.dataset.cancelarOc)));
}

// O solicitante cancela o próprio pedido enquanto não vira OC.
async function cancelarSolicitacao(id) {
    if (!confirm('Cancelar esta solicitação? Ela sai da fila de análise.')) return;
    try {
        await updateDoc(doc(db, 'solicitacoes', id), { status: 'cancelada', atualizadoEm: serverTimestamp() });
        if (estado.editando?.id === id) limparFormulario();
    } catch (error) { console.error(error); alert('Não foi possível cancelar a solicitação.'); }
}

// ...e a OC que nasceu do pedido dele, enquanto não foi finalizada.
async function cancelarMinhaOc(numero) {
    if (!confirm(`Cancelar a OC ${numero}? Não dá para desfazer.`)) return;
    try {
        await updateDoc(doc(db, 'ocs', String(numero)), { status: 'Cancelado', statusAtualizadoPor: estado.usuario.login, statusAtualizadoPorNome: estado.usuario.nome, statusAtualizadoEm: serverTimestamp() });
    } catch (error) { console.error(error); alert('Não foi possível cancelar a OC.'); }
}

// ---------------------------------------------------------------------------
// Análise (analista)
// ---------------------------------------------------------------------------
function renderAnalise() {
    const n = estado.analise.length;
    $('contagem-analise').hidden = n === 0;
    $('contagem-analise').textContent = n;
    if (!n) return vazio('tbody-analise', 8, 'Nenhuma solicitação aguardando análise.');
    const lista = [...estado.analise].sort((a, b) => (a.atualizadoEm?.seconds ?? 0) - (b.atualizadoEm?.seconds ?? 0));
    $('tbody-analise').innerHTML = lista.map(s => `<tr>
        <td class="col-data"><strong>${formatarData(dataDe(s.criadoEm))}</strong></td>
        <td>${escapar(s.solicitante)}</td>
        <td>${escapar(s.tipo)}</td>
        <td>${escapar(s.sexo)} · ${escapar(s.raca)}</td>
        <td class="col-num">${formatarNumero(s.quantidade)}</td>
        <td>${escapar(s.origem)} → ${escapar(s.destino)}</td>
        <td>${formatarData(s.dataPrevista)}</td>
        <td><div class="acoes-linha"><button class="btn btn-primario btn-sm" data-analisar="${s.id}">Analisar</button></div></td>
    </tr>`).join('');
    $('tbody-analise').querySelectorAll('[data-analisar]').forEach(b => b.onclick = () => abrirAnalise(b.dataset.analisar));
}

function linhaOrigem(o = {}) {
    const div = document.createElement('div');
    div.className = 'origem-linha';
    div.innerHTML = `
        <div class="form-group"><label>Origem</label><input data-o="origem" list="lista-origens" autocomplete="off" value="${escapar(o.origem ?? '')}"></div>
        <div class="form-group"><label>Quantidade</label><input data-o="quantidade" type="number" min="1" step="1" inputmode="numeric" value="${o.quantidade ?? ''}"></div>
        <div class="form-group"><label>Sequência</label><input data-o="sequencia" placeholder="1 a 50" value="${escapar(o.sequencia ?? '')}"></div>
        <div class="form-group"><label>R$/@</label><input data-o="preco" inputmode="decimal" placeholder="0,00" value="${o.preco != null ? formatarPreco(o.preco) : ''}"></div>
        <button type="button" class="btn btn-fantasma" aria-label="Remover origem"><svg class="icon"><use href="../assets/img/icones.svg#fechar"></use></svg></button>`;
    div.querySelector('button').onclick = () => {
        if ($('lista-origens-oc').children.length > 1) { div.remove(); atualizarTotalOrigens(); }
    };
    div.querySelector('[data-o="quantidade"]').addEventListener('input', atualizarTotalOrigens);
    $('lista-origens-oc').appendChild(div);
}

function atualizarTotalOrigens() {
    const total = [...$('lista-origens-oc').querySelectorAll('[data-o="quantidade"]')].reduce((s, i) => s + (Number(i.value) || 0), 0);
    const pedido = estado.analisando?.quantidade ?? 0;
    $('total-origens').textContent = `Total das origens: ${formatarNumero(total)} cabeças` + (total !== pedido ? ` (solicitado: ${formatarNumero(pedido)})` : '');
}

function abrirAnalise(id) {
    const s = estado.analise.find(x => x.id === id);
    if (!s) return;
    estado.analisando = s;
    const item = (rotulo, valor, largo = false) => `<div${largo ? ' class="largo"' : ''}><dt>${rotulo}</dt><dd>${escapar(valor) || '—'}</dd></div>`;
    $('resumo-solicitacao').innerHTML = [
        item('Tipo', s.tipo), item('Sexo', s.sexo), item('Raça', s.raca),
        item('Cabeças', formatarNumero(s.quantidade)), item('Origem', s.origem), item('Destino', s.destino),
        item('Proprietário', s.proprietario), item('Data prevista', formatarData(s.dataPrevista)), item('Preço R$/@', s.preco != null ? formatarPreco(s.preco) : ''),
        item('Solicitante', s.solicitante), item('Responsável', s.responsavel), item('Telefone', s.telefone),
        item('Observação', s.observacao, true)
    ].join('');
    criarOpcoes($('a-trava'), TRAVAS);
    $('lista-origens-oc').innerHTML = '';
    linhaOrigem({ origem: s.origem, quantidade: s.quantidade, sequencia: `1 a ${s.quantidade}`, preco: s.preco });
    atualizarTotalOrigens();
    $('a-mensagem').value = '';
    $('erro-analise').textContent = '';
    $('dialogo-analise').showModal();
}
$('btn-add-origem').onclick = () => { linhaOrigem(); atualizarTotalOrigens(); };

function lerOrigens() {
    const origens = [];
    for (const linha of $('lista-origens-oc').children) {
        const valor = n => linha.querySelector(`[data-o="${n}"]`);
        const o = {
            origem: valor('origem').value.trim(),
            quantidade: Number(valor('quantidade').value),
            sequencia: valor('sequencia').value.trim(),
            preco: lerNumero(valor('preco').value)
        };
        const ok = o.origem && Number.isInteger(o.quantidade) && o.quantidade > 0 && !Number.isNaN(o.preco);
        linha.querySelectorAll('input').forEach(i => i.classList.remove('campo-invalido'));
        if (!ok) {
            if (!o.origem) valor('origem').classList.add('campo-invalido');
            if (!(Number.isInteger(o.quantidade) && o.quantidade > 0)) valor('quantidade').classList.add('campo-invalido');
            if (Number.isNaN(o.preco)) valor('preco').classList.add('campo-invalido');
            return null;
        }
        origens.push(o);
    }
    return origens;
}

const assinaturaAnalise = () => ({ analisadoPor: estado.usuario.login, analisadoPorNome: estado.usuario.nome, analisadoEm: serverTimestamp() });

let analisando = false;
async function comBloqueio(acao) {
    if (analisando) return;
    analisando = true;
    document.querySelectorAll('#form-analise .form-acoes .btn').forEach(b => { b.disabled = true; });
    try { await acao(); }
    catch (error) {
        console.error(error);
        $('erro-analise').textContent = error.message?.startsWith('Esta solicitação') ? error.message : 'Não foi possível concluir. Tente novamente.';
    } finally {
        analisando = false;
        document.querySelectorAll('#form-analise .form-acoes .btn').forEach(b => { b.disabled = false; });
    }
}

$('btn-gerar-oc').onclick = () => comBloqueio(async () => {
    const s = estado.analisando;
    const trava = $('a-trava').dataset.valor;
    $('erro-analise').textContent = '';
    if (!TRAVAS.includes(trava)) { $('a-trava').classList.add('campo-invalido'); $('erro-analise').textContent = 'Escolha se o gado será travado antes de gerar a OC.'; return; }
    const origens = lerOrigens();
    if (!origens) { $('erro-analise').textContent = 'Confira as origens destacadas.'; return; }
    const quantidade = origens.reduce((t, o) => t + o.quantidade, 0);
    if (quantidade !== s.quantidade && !confirm(`O total das origens (${quantidade}) é diferente do solicitado (${s.quantidade}). Gerar a OC com ${quantidade} cabeças?`)) return;

    const numero = await runTransaction(db, async t => {
        const refSol = doc(db, 'solicitacoes', s.id);
        const refContador = doc(db, 'config', 'contador');
        const [sol, contador] = await Promise.all([t.get(refSol), t.get(refContador)]);
        if (sol.data()?.status !== 'aguardando') throw new Error('Esta solicitação já foi analisada por outra pessoa.');
        let n = contador.data()?.proxima;
        if (!Number.isInteger(n)) throw new Error('Contador de OCs não configurado (config/contador).');
        // Números de OCs excluídas voltam primeiro, do menor para o maior.
        const liberados = contador.data().liberados || [];
        let reuso = null;
        for (const l of [...liberados].sort((a, b) => a - b)) {
            if (!(await t.get(doc(db, 'ocs', String(l)))).exists()) { reuso = l; break; }
        }
        if (reuso !== null) n = reuso;
        // Senão, o próximo número livre: pula números que já existam (ex.: OCs importadas).
        else while ((await t.get(doc(db, 'ocs', String(n)))).exists()) n++;
        t.set(doc(db, 'ocs', String(n)), {
            numero: n, dataEmissao: hojeIso(), status: 'Em Andamento', viabilidade: 'Pendente', trava,
            tipo: s.tipo, sexo: s.sexo, raca: s.raca, quantidade, origens,
            destino: s.destino, proprietario: s.proprietario, dataPrevista: s.dataPrevista,
            observacao: s.observacao || '', telefone: s.telefone || '',
            solicitante: s.solicitante, responsavel: s.responsavel,
            criadoPor: s.criadoPor, solicitacaoId: s.id,
            geradaPor: estado.usuario.login, geradaPorNome: estado.usuario.nome, geradaEm: serverTimestamp()
        });
        if (reuso !== null) t.update(refContador, { liberados: liberados.filter(l => l !== reuso), ultimoReuso: reuso });
        else t.update(refContador, { proxima: n + 1 });
        t.update(refSol, { status: 'gerada', ocNumero: n, mensagemAnalista: '', ...assinaturaAnalise() });
        return n;
    });
    $('dialogo-analise').close();
    alert(`OC ${numero} gerada: Em Andamento, com viabilidade Pendente.`);
});

async function devolver(status) {
    const mensagem = $('a-mensagem').value.trim();
    if (!mensagem) {
        $('a-mensagem').classList.add('campo-invalido');
        $('erro-analise').textContent = status === 'ajuste' ? 'Escreva o que precisa ser ajustado.' : 'Informe o motivo da recusa.';
        $('a-mensagem').focus();
        return;
    }
    $('a-mensagem').classList.remove('campo-invalido');
    if (status === 'recusada' && !confirm('Recusar esta solicitação?')) return;
    await updateDoc(doc(db, 'solicitacoes', estado.analisando.id), { status, mensagemAnalista: mensagem, ...assinaturaAnalise() });
    $('dialogo-analise').close();
}
$('btn-pedir-ajuste').onclick = () => comBloqueio(() => devolver('ajuste'));
$('btn-recusar').onclick = () => comBloqueio(() => devolver('recusada'));

// ---------------------------------------------------------------------------
// Ordens de compra (analista)
// ---------------------------------------------------------------------------
function montarOcs() {
    $('filtro-status').insertAdjacentHTML('beforeend', STATUS_OC.map(s => `<option>${s}</option>`).join(''));
    $('filtro-tipo').insertAdjacentHTML('beforeend', TIPOS.map(s => `<option>${s}</option>`).join(''));
    ['busca-ocs', 'filtro-status', 'filtro-tipo'].forEach(id => $(id).addEventListener('input', renderOcs));
    $('btn-exportar').onclick = exportarCsv;
}

const textoOrigens = oc => (oc.origens || []).map(o => o.origem).filter(Boolean).join(', ');
// OCs da planilha podem ter número com letra ("1173 A"); o rótulo guarda como estava.
const rotuloOc = oc => oc.rotulo || String(oc.numero);
const dataOc = oc => oc.dataPrevista || oc.dataEmissao;
function ocsFiltradas() {
    const busca = $('busca-ocs').value, status = $('filtro-status').value, tipo = $('filtro-tipo').value;
    return estado.ocs
        .filter(oc => (!status || oc.status === status) && (!tipo || oc.tipo === tipo)
            && contemTermos([rotuloOc(oc), textoOrigens(oc), oc.destino, oc.responsavel, oc.solicitante, oc.raca, oc.sexo, oc.proprietario].join(' '), busca))
        .sort((a, b) => b.numero - a.numero || compararNomes(b.id, a.id));
}

function renderOcs() {
    const contagem = Object.fromEntries(STATUS_OC.map(s => [s, 0]));
    estado.ocs.forEach(oc => { if (oc.status in contagem) contagem[oc.status]++; });
    const viabilidadePendente = estado.ocs.filter(oc => oc.status === 'Em Andamento' && oc.viabilidade === 'Pendente').length;
    const indicador = (rotulo, valor) => `<div class="indicador"><span class="indicador-rotulo">${rotulo}</span><span class="indicador-valor">${formatarNumero(valor)}</span></div>`;
    $('indicadores-ocs').innerHTML = STATUS_OC.map(s => indicador(s, contagem[s])).join('') + indicador('Viabilidade pendente', viabilidadePendente);

    const lista = ocsFiltradas();
    $('contagem-ocs').textContent = `${formatarNumero(lista.length)} de ${formatarNumero(estado.ocs.length)} OCs`;
    if (!lista.length) return vazio('tbody-ocs', 13, estado.ocs.length ? 'Nenhuma OC encontrada com esses filtros.' : 'Nenhuma OC cadastrada.');
    $('tbody-ocs').innerHTML = lista.map(oc => `<tr>
        <td class="col-num"><strong>${escapar(rotuloOc(oc))}</strong>${oc.alerta ? ` <span class="tag tag-alerta" title="${escapar(oc.alerta)}">!</span>` : ''}</td>
        <td>${formatarData(dataOc(oc))}</td>
        <td>${escapar(oc.tipo)}</td>
        <td>${escapar(oc.sexo)}${oc.raca ? ' · ' + escapar(oc.raca) : ''}</td>
        <td class="col-num">${formatarNumero(oc.quantidade)}</td>
        <td><span class="texto-cortado" title="${escapar(textoOrigens(oc))}">${escapar(textoOrigens(oc))}</span></td>
        <td>${escapar(oc.destino)}</td>
        <td>${escapar(oc.proprietario)}</td>
        <td>${escapar(oc.trava || '—')}</td>
        <td>${escapar(oc.responsavel)}</td>
        <td><select class="select-status" data-oc="${escapar(oc.id)}" title="${escapar(DESCRICAO_STATUS_OC[oc.status] || '')}" aria-label="Status da OC ${escapar(rotuloOc(oc))}">
            ${STATUS_OC.map(s => `<option${s === oc.status ? ' selected' : ''}>${s}</option>`).join('')}
        </select></td>
        <td><select class="select-status" data-viabilidade="${escapar(oc.id)}" title="${escapar(DESCRICAO_VIABILIDADE[oc.viabilidade] || '')}" aria-label="Viabilidade da OC ${escapar(rotuloOc(oc))}">
            ${VIABILIDADES.map(v => `<option${v === oc.viabilidade ? ' selected' : ''}>${v}</option>`).join('')}
        </select></td>
        <td>${oc.status === 'Cancelado' ? `<button class="btn btn-perigo btn-sm" data-excluir="${escapar(oc.id)}">Excluir</button>` : ''}</td>
    </tr>`).join('');
    $('tbody-ocs').querySelectorAll('[data-excluir]').forEach(b => b.onclick = () => excluirOc(estado.ocs.find(o => o.id === b.dataset.excluir)));
    // Status e viabilidade são gravados sempre juntos, para a OC antiga já passar ao formato novo.
    const mudar = (sel, campo, rotulo, descricao) => sel.onchange = async () => {
        const oc = estado.ocs.find(o => o.id === sel.dataset[campo === 'status' ? 'oc' : 'viabilidade']);
        if (!confirm(`Mudar ${rotulo} da OC ${rotuloOc(oc)} de ${oc[campo]} para ${sel.value}?\n\n${sel.value}: ${descricao[sel.value]}`)) { sel.value = oc[campo]; return; }
        try {
            await updateDoc(doc(db, 'ocs', oc.id), {
                status: oc.status, viabilidade: oc.viabilidade, [campo]: sel.value,
                statusAtualizadoPor: estado.usuario.login, statusAtualizadoPorNome: estado.usuario.nome, statusAtualizadoEm: serverTimestamp()
            });
        } catch (error) { console.error(error); sel.value = oc[campo]; alert(`Não foi possível mudar ${rotulo}.`); }
    };
    $('tbody-ocs').querySelectorAll('[data-oc]').forEach(sel => mudar(sel, 'status', 'o status', DESCRICAO_STATUS_OC));
    $('tbody-ocs').querySelectorAll('[data-viabilidade]').forEach(sel => mudar(sel, 'viabilidade', 'a viabilidade', DESCRICAO_VIABILIDADE));
}

// Só OC cancelada é excluída. O número entra em config/contador.liberados e a próxima OC gerada
// o reaproveita; a solicitação de origem fica Cancelada, sem número de OC.
async function excluirOc(oc) {
    const numeroLivre = oc.id === String(oc.numero);   // OCs da planilha com letra ("1173 A") não liberam número
    if (!confirm(`Excluir a OC ${rotuloOc(oc)}? Ela some do sistema e não dá para desfazer.`
        + (numeroLivre ? `\n\nO número ${oc.numero} será usado na próxima OC gerada.` : ''))) return;
    try {
        await runTransaction(db, async t => {
            const refOc = doc(db, 'ocs', oc.id), refContador = doc(db, 'config', 'contador');
            const [atual, contador] = await Promise.all([t.get(refOc), t.get(refContador)]);
            if (atual.data()?.status !== 'Cancelado') throw new Error('Esta OC não está mais cancelada.');
            const sol = oc.solicitacaoId ? await t.get(doc(db, 'solicitacoes', oc.solicitacaoId)) : null;
            const liberados = contador.data()?.liberados || [];
            t.delete(refOc);
            if (numeroLivre && oc.numero < contador.data()?.proxima && !liberados.includes(oc.numero)) {
                t.update(refContador, { liberados: [...liberados, oc.numero], ultimoLiberado: oc.numero });
            }
            if (sol?.data()?.status === 'gerada' && sol.data().ocNumero === oc.numero) {
                t.update(sol.ref, { status: 'cancelada', ocNumero: deleteField(), mensagemAnalista: `OC ${oc.numero} excluída.`, ...assinaturaAnalise() });
            }
        });
    } catch (error) {
        console.error(error);
        alert(error.message?.startsWith('Esta OC') ? error.message : 'Não foi possível excluir a OC.');
    }
}

// Mesmas colunas da planilha original de OCs, mais Raça, Solicitante, Responsável e Viabilidade no fim.
// Uma linha por origem, como na planilha.
function exportarCsv() {
    const colunas = ['Status da OC', 'OC', 'Qtd cb', 'Sexo', 'Operação', 'Proprietário', 'Origem', 'Destino', 'Sequência de OC', 'Data', 'Trava', 'Observação', 'Raça', 'Solicitante', 'Responsável', 'Viabilidade'];
    const celula = v => { const t = String(v ?? ''); return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const linhas = [];
    for (const oc of ocsFiltradas().reverse()) {
        const origens = oc.origens?.length ? oc.origens : [{}];
        for (const o of origens) {
            const obs = [o.preco != null ? `R$ ${formatarPreco(o.preco)}/@` : '', o.obs, oc.observacao].filter(Boolean).join(' | ');
            linhas.push([oc.status, rotuloOc(oc), o.quantidade, oc.sexo, oc.tipo, oc.proprietario, o.origem, oc.destino, o.sequencia,
                formatarData(dataOc(oc)), oc.trava ? `Travar ${oc.trava}` : '', obs, oc.raca, oc.solicitante, oc.responsavel, oc.viabilidade].map(celula).join(';'));
        }
    }
    // BOM + ";" para o Excel em português abrir com acentos e colunas certas
    const blob = new Blob(['﻿' + [colunas.join(';'), ...linhas].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `ordens-de-compra-${hojeIso()}.csv` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------------------
// Cadastros (analista)
// ---------------------------------------------------------------------------
function montarCadastros() {
    $('grade-cadastros').innerHTML = Object.entries(NOMES_LISTAS).map(([id, nome]) => `
        <form class="card" data-lista="${id}">
            <div class="card-cabecalho"><div><h2 class="card-titulo">${nome}</h2><p class="card-subtitulo" data-contagem></p></div>
            <button class="btn btn-primario btn-sm" type="submit">Salvar</button></div>
            <div class="form-group"><label class="sr-only" for="lista-${id}">${nome}</label><textarea id="lista-${id}" spellcheck="false"></textarea></div>
            <p class="ajuda" data-status role="status"></p>
        </form>`).join('');
    $('grade-cadastros').querySelectorAll('form').forEach(form => {
        const area = form.querySelector('textarea');
        area.addEventListener('input', () => { form.dataset.alterado = '1'; });
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const itens = [...new Set(area.value.split('\n').map(l => l.trim()).filter(Boolean))].sort(compararNomes);
            const status = form.querySelector('[data-status]');
            try {
                await setDoc(doc(db, 'listas', form.dataset.lista), { itens, atualizadoPor: estado.usuario.login, atualizadoEm: serverTimestamp() });
                delete form.dataset.alterado;
                status.textContent = 'Salvo.';
            } catch (error) { console.error(error); status.textContent = 'Não foi possível salvar.'; }
        });
    });
    montarImportacao();
}

function montarImportacao() {
    let lido = null;
    const status = $('status-importar');
    $('arquivos-importar').addEventListener('change', async e => {
        lido = await lerArquivosPlanilha([...e.target.files]);
        const existentes = new Set(estado.ocs.map(o => o.id));
        const novas = lido.ocs ? lido.ocs.filter(o => !existentes.has(o.id)).length : 0;
        status.textContent = [
            lido.ocs ? `${lido.ocs.length} OCs no arquivo, ${novas} novas para importar.` : '',
            lido.cadastros ? `Cadastros: ${lido.cadastros.fazendas.length} fazendas de destino, ${lido.cadastros.origens.length} outras origens, ${lido.cadastros.racas.length} raças, ${lido.cadastros.responsaveis.length} responsáveis.` : '',
            ...lido.erros
        ].filter(Boolean).join(' ');
        $('btn-importar').disabled = !(novas || lido.cadastros);
    });
    $('btn-importar').onclick = async () => {
        if (!lido) return;
        const botao = $('btn-importar');
        const existentes = new Set(estado.ocs.map(o => o.id));
        const novas = (lido.ocs || []).filter(o => !existentes.has(o.id));
        const avisoListas = lido.cadastros ? '\nAs listas de cadastro serão substituídas pelas do arquivo.' : '';
        if (!confirm(`Importar ${novas.length} OCs?${avisoListas}`)) return;
        botao.disabled = true;
        try {
            if (lido.cadastros) {
                for (const [nome, itens] of Object.entries(lido.cadastros)) {
                    await setDoc(doc(db, 'listas', nome), { itens: [...itens].sort(compararNomes), atualizadoPor: estado.usuario.login, atualizadoEm: serverTimestamp() });
                }
            }
            for (let i = 0; i < novas.length; i += 200) {
                const lote = writeBatch(db);
                for (const oc of novas.slice(i, i + 200)) {
                    lote.set(doc(db, 'ocs', oc.id), { ...oc.dados, importadaPor: estado.usuario.login, importadaEm: serverTimestamp() });
                }
                await lote.commit();
                status.textContent = `Importando... ${Math.min(i + 200, novas.length)} de ${novas.length} OCs.`;
            }
            status.textContent = `Pronto: ${novas.length} OCs importadas${lido.cadastros ? ' e cadastros atualizados' : ''}.`;
            lido = null;
            $('arquivos-importar').value = '';
        } catch (error) {
            console.error(error);
            status.textContent = 'A importação parou no meio. Escolha os arquivos de novo e clique em Importar: o que já entrou é pulado.';
            botao.disabled = false;
        }
    };
}

function renderCadastros() {
    $('grade-cadastros').querySelectorAll('form').forEach(form => {
        const itens = estado.listas[form.dataset.lista] || [];
        form.querySelector('[data-contagem]').textContent = `${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`;
        if (!form.dataset.alterado) form.querySelector('textarea').value = [...itens].sort(compararNomes).join('\n');
    });
}

// ---------------------------------------------------------------------------
// Usuários (Master)
// Cada pessoa cria o próprio acesso. Senha esquecida: o Master apaga a conta em
// Authentication, no Console do Firebase, e a pessoa cria de novo com o mesmo usuário,
// mantendo perfil e histórico (o cadastro fica guardado pelo login).
// ---------------------------------------------------------------------------
function renderUsuarios() {
    const lista = [...estado.usuarios].sort((a, b) => compararNomes(a.nome, b.nome));
    if (!lista.length) return vazio('tbody-usuarios', 4, 'Nenhum usuário.');
    const eu = estado.usuario.login;
    $('tbody-usuarios').innerHTML = lista.map(u => {
        const proprio = u.login === eu;
        // O cargo Master é fixo (lista MASTERS): não se troca nem se desativa por aqui.
        const fixo = MASTERS.includes(u.login);
        return `<tr>
            <td><strong>${escapar(u.nome)}</strong>${proprio ? ' <span class="texto-suave">(você)</span>' : ''}</td>
            <td>${escapar(u.login)}</td>
            <td>${fixo ? tag('Master', 'tag-indigo') : `<select class="select-status" data-perfil="${escapar(u.login)}" aria-label="Cargo de ${escapar(u.nome)}">
                <option value="solicitante"${u.perfil === 'solicitante' ? ' selected' : ''}>Solicitante</option>
                <option value="analista"${u.perfil === 'analista' ? ' selected' : ''}>Analista</option>
            </select>`}</td>
            <td><div class="acoes-linha">${u.ativo === false ? tag('Desativado', 'tag-perigo') : tag('Ativo', 'tag-verde')}${fixo ? '' : `
                <button class="btn ${u.ativo === false ? 'btn-secundario' : 'btn-perigo'} btn-sm" data-ativo="${escapar(u.login)}">${u.ativo === false ? 'Reativar' : 'Desativar'}</button>`}
            </div></td>
        </tr>`;
    }).join('');
    const achar = login => estado.usuarios.find(u => u.login === login);
    $('tbody-usuarios').querySelectorAll('[data-perfil]').forEach(sel => sel.onchange = async () => {
        const u = achar(sel.dataset.perfil);
        if (!confirm(`Mudar ${u.nome} para ${sel.value === 'analista' ? 'Analista' : 'Solicitante'}?`)) { sel.value = u.perfil; return; }
        try { await updateDoc(doc(db, 'usuarios', u.login), { perfil: sel.value }); }
        catch (error) { console.error(error); sel.value = u.perfil; alert('Não foi possível mudar o perfil.'); }
    });
    $('tbody-usuarios').querySelectorAll('[data-ativo]').forEach(b => b.onclick = async () => {
        const u = achar(b.dataset.ativo), ativar = u.ativo === false;
        if (!confirm(`${ativar ? 'Reativar' : 'Desativar'} o acesso de ${u.nome}?`)) return;
        try { await updateDoc(doc(db, 'usuarios', u.login), { ativo: ativar }); }
        catch (error) { console.error(error); alert('Não foi possível alterar o acesso.'); }
    });
}

