# Configurar e manter o Firebase

Projeto: **GVQ Ordens de Compra** (`gvq-ordens-de-compra`), no plano gratuito (Spark). Console: https://console.firebase.google.com/project/gvq-ordens-de-compra

## O que já está configurado

- App Web registrado; os dados dele estão em [`js/firebase.js`](../js/firebase.js).
- **Authentication → Método de login:** E-mail/senha ativado. O e-mail é interno (`usuario@gvq.com.br`); ninguém digita e-mail.
- **Authentication → Configurações → Ações do usuário:** "Ativar criação (inscrição)" ligado, para cada pessoa criar o próprio acesso.
- **Authentication → Configurações → Domínios autorizados:** `wiziackmatheeus-sys.github.io`.
- **Firestore:** banco `(default)` em `southamerica-east1` (São Paulo), modo de produção.
- **Firestore → config/contador:** `proxima` = 1652, o número da próxima OC.

## Publicar as regras de segurança

As regras ficam em [`firestore.rules`](../firestore.rules). Depois de mudar o arquivo:

1. Console → **Firestore Database → Regras**.
2. Apagar o conteúdo, colar o arquivo inteiro e clicar em **Publicar**.

## Cargo Master

`matheus.souza` e `matheus.silveira` são Master por login: a lista está em `firestore.rules` (`loginsMaster`) e em `js/listas.js` (`MASTERS`), e as duas precisam ficar iguais. Não precisa mexer no banco. O Master faz tudo o que o analista faz e é o único que promove a Analista, volta para Solicitante ou desativa alguém, pela aba **Usuários**.

Para trocar quem é Master, edite as duas listas e publique as regras de novo.

## Senha esquecida

Não há redefinição de senha. Quando alguém esquece:

1. Console → **Authentication → Usuários**.
2. Procurar `login@gvq.com.br` (ex.: `matheus.silveira@gvq.com.br`), clicar nos três pontinhos → **Excluir conta**.
3. A pessoa clica em **Criar acesso** no site, digita o mesmo nome e uma senha nova. Perfil, situação e histórico de solicitações continuam, porque o cadastro em `usuarios` fica guardado pelo login.

Para tirar o acesso de alguém, use **Desativar** na aba Usuários. Recriar a conta não reativa um acesso desativado.

## Carga das OCs da planilha

Feita uma vez, pelo analista, na aba **Cadastros → Carga inicial do sistema antigo**: escolher `ocs-planilha.json` e `cadastros.json` (pasta `dados-iniciais` do zip do sistema antigo) e clicar em **Importar**. As OCs já importadas são puladas. Os arquivos não vão para o repositório, que é público.

Pontos da planilha que continuam para conferir: a OC 1635 aparece duas vezes (a de Rodrigo Fonseca para Sentinela provavelmente seria a 1627; as duas aparecem com um "!" na lista), as OCs 1465 e 1466 estão sem quantidade e as OCs 1345 a 1347 estão sem data (vinham com ano 1900).
