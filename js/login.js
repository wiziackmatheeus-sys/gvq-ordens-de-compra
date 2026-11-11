import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db, configurado, emailDoLogin } from "./firebase.js";
import { auth as authCompras } from "../compras/js/firebase.js";
import { sugerirLogin } from "./util.js";

// Login único dos dois ambientes: o mesmo usuário e senha entram nas Ordens de Compra (Firebase
// gvq-ordens-de-compra) e na Compra de Gado (Firebase gvq-sistema-compras). Depois a pessoa
// escolhe o ambiente em pages/ambientes.html.
const $ = id => document.getElementById(id);
const MENSAGENS = {
    'auth/invalid-credential': 'Usuário ou senha incorretos.',
    'auth/invalid-email': 'Usuário ou senha incorretos.',
    'auth/user-disabled': 'Este acesso está desativado. Fale com o analista.',
    'auth/email-already-in-use': 'Este usuário já existe. Se esqueceu a senha, peça ao analista para apagar o acesso antigo.',
    'auth/weak-password': 'Escolha uma senha mais forte, com pelo menos 8 caracteres.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
    'auth/network-request-failed': 'Falha de conexão. Confira a internet e tente novamente.',
    'auth/operation-not-allowed': 'A criação de acessos está desligada no Firebase.',
    'auth/admin-restricted-operation': 'A criação de acessos está desligada no Firebase.'
};

if (!configurado) {
    $('erro-login').textContent = 'Sistema ainda não configurado: falta preencher js/firebase.js com os dados do projeto Firebase.';
    $('btn-entrar').disabled = $('btn-criar').disabled = true;
}

function mostrarAba(criar) {
    for (const [aba, form, ativa] of [['aba-entrar', 'form-login', !criar], ['aba-criar', 'form-cadastro', criar]]) {
        $(aba).classList.toggle('ativa', ativa);
        $(aba).setAttribute('aria-selected', String(ativa));
        $(form).hidden = !ativa;
    }
}
$('aba-entrar').onclick = () => mostrarAba(false);
$('aba-criar').onclick = () => mostrarAba(true);

// Chegar ao login (inclusive pelo "Sair" de qualquer ambiente) encerra as duas sessões.
if (configurado) signOut(auth).catch(() => {});
signOut(authCompras).catch(() => {});

// Garante o cadastro das Ordens de Compra no banco. O cadastro fica guardado pelo login: quem cria
// o acesso pela primeira vez começa como solicitante (o analista promove na aba Usuários); quem recria
// o acesso depois de esquecer a senha retoma o mesmo cadastro, com perfil e histórico.
async function registrarOrdens(user, nome) {
    const login = user.email.split('@')[0];
    const ref = doc(db, 'usuarios', login);
    let snap = await getDoc(ref);
    if (!snap.exists()) {
        await setDoc(ref, { nome: nome || user.displayName || login, uid: user.uid, perfil: 'solicitante', ativo: true, criadoEm: serverTimestamp() });
        snap = await getDoc(ref);
    } else if (snap.data().uid !== user.uid) {
        await updateDoc(ref, { uid: user.uid, recriadoEm: serverTimestamp() });
        snap = await getDoc(ref);
    }
    const perfil = snap.data();
    if (perfil.ativo === false) {
        await signOut(auth);
        throw Object.assign(new Error(), { code: 'auth/user-disabled' });
    }
}

const irParaAmbientes = () => { location.href = 'pages/ambientes.html'; };

let ocupado = false;
async function executar(botao, erro, rotulo, acao) {
    if (ocupado || !configurado) return;
    ocupado = true;
    $(erro).textContent = '';
    const texto = $(botao).textContent;
    $(botao).textContent = rotulo;
    $(botao).disabled = true;
    try { await acao(); }
    catch (error) {
        console.error(error);
        $(erro).textContent = error.mensagem || MENSAGENS[error.code] || 'Não foi possível concluir. Tente novamente.';
    } finally {
        ocupado = false;
        $(botao).textContent = texto;
        $(botao).disabled = false;
    }
}

$('form-login').addEventListener('submit', e => {
    e.preventDefault();
    executar('btn-entrar', 'erro-login', 'Entrando...', async () => {
        const email = emailDoLogin($('login_usuario').value.toLowerCase().trim()), senha = $('login_senha').value;
        // Tenta os dois ao mesmo tempo; basta um dar certo. Quem só tem um dos acessos (ou senhas
        // diferentes) vê o outro ambiente bloqueado na tela de escolha.
        const [ordens, compras] = await Promise.allSettled([
            signInWithEmailAndPassword(auth, email, senha),
            signInWithEmailAndPassword(authCompras, email, senha)
        ]);
        if (ordens.status === 'fulfilled') {
            try { await registrarOrdens(ordens.value.user); }
            catch (error) { if (compras.status !== 'fulfilled') throw error; }
        } else if (compras.status !== 'fulfilled') {
            throw ordens.reason;
        }
        irParaAmbientes();
    });
});

$('cadastro_nome').addEventListener('input', () => { $('cadastro_usuario').value = sugerirLogin($('cadastro_nome').value); });

$('form-cadastro').addEventListener('submit', e => {
    e.preventDefault();
    executar('btn-criar', 'erro-cadastro', 'Criando...', async () => {
        const nome = $('cadastro_nome').value.trim().replace(/\s+/g, ' ');
        const login = sugerirLogin(nome);
        const senha = $('cadastro_senha').value;
        if (!login) throw { mensagem: 'Informe nome e sobrenome para gerar o usuário.' };
        if (senha.length < 8) throw { mensagem: 'A senha precisa ter pelo menos 8 caracteres.' };
        if (senha !== $('cadastro_confirmar').value) throw { mensagem: 'As senhas precisam ser iguais.' };
        const { user } = await createUserWithEmailAndPassword(auth, emailDoLogin(login), senha);
        await updateProfile(user, { displayName: nome }).catch(() => {});
        await registrarOrdens(user, nome);
        irParaAmbientes();
    });
});
