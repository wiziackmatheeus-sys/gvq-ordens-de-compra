// Tela de escolha do ambiente, logo depois do login único (js/login.js).
// Cada ambiente tem seu próprio Firebase; aqui só se confere em qual deles a pessoa entrou
// e se o cadastro dela está liberado, para mostrar o cartão como "Entrar" ou bloqueado.
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { auth as authCompras, db as dbCompras } from "../compras/js/firebase.js";
import { paginas } from "../compras/js/auth-guard.js";
import { escapar } from "./util.js";

const $ = id => document.getElementById(id);

// O primeiro aviso do Firebase diz se há sessão guardada neste navegador.
const sessao = a => a ? new Promise(r => { const parar = onAuthStateChanged(a, u => { parar(); r(u); }); }) : Promise.resolve(null);

async function acessoOrdens(user) {
    if (!user) return { aviso: 'Seu usuário e senha não abriram este ambiente.' };
    const snap = await getDoc(doc(db, 'usuarios', user.email.split('@')[0]));
    if (!snap.exists()) return { aviso: 'Cadastro não encontrado neste ambiente.' };
    if (snap.data().ativo === false) return { aviso: 'Seu acesso a este ambiente está desativado. Fale com o analista.' };
    return { href: 'app.html', nome: snap.data().nome };
}

async function acessoCompras(user) {
    const semAcesso = { aviso: 'Seu usuário e senha não abriram este ambiente.',
        links: [['Solicitar cadastro', '../compras/cadastro.html#cadastro'], ['Entrar com outra senha', '../compras/cadastro.html']] };
    if (!user) return semAcesso;
    const snap = await getDoc(doc(dbCompras, 'usuarios', user.uid));
    if (!snap.exists()) return semAcesso;
    const p = snap.data();
    if (!paginas[p.perfil] || p.aprovado !== true || (p.perfil === 'pesador' && !p.compradorUid))
        return { aviso: 'Seu cadastro está aguardando a aprovação do escritório.', nome: p.nome };
    if (p.trocaSenhaObrigatoria) return { href: '../compras/pages/trocar-senha.html', nome: p.nome, rotulo: 'Trocar senha e entrar' };
    return { href: '../compras/pages/' + paginas[p.perfil], nome: p.nome };
}

function montarCartao(id, acesso) {
    const cartao = $(id);
    cartao.classList.toggle('bloqueado', !acesso.href);
    const aviso = cartao.querySelector('[data-aviso]');
    aviso.textContent = acesso.aviso || '';
    aviso.hidden = !acesso.aviso;
    const acoes = acesso.href
        ? `<a class="btn btn-primario btn-lg btn-bloco" href="${escapar(acesso.href)}">${escapar(acesso.rotulo || 'Entrar')}</a>`
        : (acesso.links || []).map(([texto, href]) => `<a class="btn btn-secundario btn-sm" href="${escapar(href)}">${escapar(texto)}</a>`).join('');
    cartao.querySelector('[data-acoes]').innerHTML = acoes;
}

const verificar = (fn, user) => fn(user).catch(error => { console.error(error); return { aviso: 'Não foi possível verificar seu acesso agora. Atualize a página.' }; });

const [userOrdens, userCompras] = await Promise.all([sessao(auth), sessao(authCompras)]);
if (!userOrdens && !userCompras) location.replace('../index.html');
else {
    const [ordens, compras] = await Promise.all([verificar(acessoOrdens, userOrdens), verificar(acessoCompras, userCompras)]);
    const nome = (ordens.nome || compras.nome || '').split(' ')[0];
    $('amb-nome').textContent = nome ? `, ${nome}` : '';
    montarCartao('amb-ordens', ordens);
    montarCartao('amb-compras', compras);
    $('amb-carregando').hidden = true;
    $('amb-grade').hidden = false;
}

$('btn-sair').onclick = async () => {
    await Promise.allSettled([auth && signOut(auth), signOut(authCompras)]);
    location.href = '../index.html';
};
