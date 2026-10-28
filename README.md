# GVQ — Ordens de Compra

Sistema do Grupo Vilela de Queiroz para solicitar e emitir Ordens de Compra (OC) de compra, transferência e trading de gado entre as fazendas.

- **Site:** páginas estáticas no GitHub Pages: https://wiziackmatheeus-sys.github.io/gvq-ordens-de-compra/
- **Banco e login:** Firebase (Authentication + Firestore), plano gratuito. As permissões ficam em [`firestore.rules`](firestore.rules).

## Acesso

Login simples: usuário (`nome.sobrenome`, gerado pelo nome) e senha de pelo menos 8 caracteres. Cada pessoa cria o próprio acesso e começa como **Solicitante**; só o **Master** promove a **Analista** ou desativa, na aba Usuários. O cargo Master é fixo por login (`matheus.souza` e `matheus.silveira`, em `js/listas.js` e `firestore.rules`). Não há e-mail nem redefinição de senha: quem esquece tem a conta apagada no Console do Firebase e cria de novo (veja [docs/CONFIGURAR-FIREBASE.md](docs/CONFIGURAR-FIREBASE.md)).

| Perfil | Abas |
|---|---|
| Solicitante | Nova solicitação, Minhas solicitações (pode cancelar o próprio pedido e a OC dele enquanto Em Andamento) |
| Analista | Nova solicitação, Minhas solicitações, Análise, Ordens de compra, Cadastros |
| Master | Todas as do analista, mais Usuários |

## Fluxo

1. O solicitante envia o pedido, que fica **Aguardando análise**.
2. O analista ou o Master gera a OC (número automático, próximo livre, com uma ou mais origens), pede ajuste ou recusa com motivo. A trava é escolhida pelo analista, obrigatoriamente, antes de gerar.
3. Toda OC nasce **Em Andamento** → **Finalizado**, ou **Cancelado**. À parte, a **Viabilidade** comercial começa **Pendente** e o analista marca **Concluída** quando o gerente da BU aprova. OCs antigas com status Pendente ou Aberto aparecem como Em Andamento (viabilidade Pendente e Concluída, respectivamente) e passam ao formato novo na próxima mudança.

## Dados no Firestore

| Coleção | Conteúdo |
|---|---|
| `usuarios/{login}` | nome, uid da conta, perfil, ativo |
| `solicitacoes/{id}` | pedido do formulário, status (`aguardando`, `ajuste`, `recusada`, `cancelada`, `gerada`), ocNumero, criadoPor (login) |
| `ocs/{numero}` | OC com `origens: [{ origem, quantidade, sequencia, preco }]`, trava, status e viabilidade |
| `config/contador` | `proxima`: número da próxima OC |
| `listas/{fazendas, origens, racas, responsaveis}` | `itens`: listas editadas na aba Cadastros |

## Rodar localmente

```sh
npm run dev
```

Abre em http://localhost:5500 com recarga automática.
