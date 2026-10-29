// Modo noturno / diurno. A escolha fica salva neste navegador; sem escolha, é o diurno.
// O <head> de cada página já aplica o tema antes de desenhar (sem piscar branco).
const CHAVE = 'gvq-tema';
const LOGOS = { claro: 'logo-gvq.png', escuro: 'logo-gvq-negativo.png' };

function aplicarTema(tema) {
    document.documentElement.dataset.tema = tema;
    // O logo índigo some no fundo escuro: no noturno entra a versão branca.
    document.querySelectorAll('img[data-logo]').forEach(img => { img.src = img.src.replace(/logo-gvq(-negativo)?\.png/, LOGOS[tema]); });
    document.querySelectorAll('[data-trocar-tema]').forEach(botao => {
        const escuro = tema === 'escuro';
        botao.setAttribute('aria-pressed', String(escuro));
        botao.title = escuro ? 'Voltar para o modo diurno' : 'Ativar o modo noturno';
        botao.querySelector('[data-rotulo]').textContent = escuro ? 'Modo diurno' : 'Modo noturno';
    });
}

aplicarTema(document.documentElement.dataset.tema === 'escuro' ? 'escuro' : 'claro');
document.querySelectorAll('[data-trocar-tema]').forEach(botao => botao.addEventListener('click', () => {
    const novo = document.documentElement.dataset.tema === 'escuro' ? 'claro' : 'escuro';
    try { localStorage.setItem(CHAVE, novo); } catch { /* navegação privada: vale só nesta página */ }
    aplicarTema(novo);
}));
