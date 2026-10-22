# GlugluCall V6 – Servidor (anfitrião)

Roda no seu PC. O Cloudflare só encaminha o domínio até aqui através de um Tunnel.

```
iniciar-servidor.bat      (duplo clique)
```
ou: `npm install` (1ª vez) e `npm start`.

## Contas, e-mail e cookies (novo na v6)
A tela de entrada agora tem **login** e **cadastro**. Quem se cadastra informa usuário, e-mail e senha e recebe um
**código de 6 dígitos por e-mail** (vale 15 min, 5 tentativas). Depois de confirmar, aparece o pop-up de boas-vindas.
O usuário é único e é o nome mostrado na sala; dá para entrar com usuário **ou** e-mail.

- **Cookies:** na primeira visita aparece o aviso de cookies. Com **Aceitar**, o login fica salvo por 30 dias e o site
  lembra da pessoa. Com **Só os essenciais**, o cookie de login vale só até fechar o navegador. A escolha pode ser
  mudada em “Preferências de cookies”, na tela de login. O cookie é `HttpOnly` e `SameSite=Lax` (e `Secure` em https).
- **Sair** (botão no canto da barra do usuário) encerra a conta naquele aparelho.
- **Enviar e-mail de verdade:** coloque `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` e `MAIL_FROM` no `.env`
  (há um exemplo com Gmail dentro do `.env.example`) e rode `npm install` uma vez (o `iniciar-servidor.bat` já faz).
  **Sem `SMTP_HOST` é modo teste:** o código aparece só na janela do servidor (`✉ [MODO TESTE] ...`).
- Contas e sessões ficam em `users.json` e `sessions.json` na pasta de dados (fora do git e fora do código). Senhas são guardadas só como hash
  (scrypt), nunca em texto. Faça cópia da pasta de dados de vez em quando.
- Contas que não confirmam o e-mail em 24 h são apagadas sozinhas. Há limite de tentativas por IP e por conta.
- A senha da sala (`ROOM_PASSWORD`) continua funcionando: se existir, ela é pedida logo depois do login.
- Quem usava a v5 entra como conta nova: perfil, foto e mensagens diretas antigas eram presos ao navegador e não são
  ligados às contas novas.

## Como saber se está tudo certo
O terminal mostra:
- `GlugluCall rodando em http://localhost:3000` → o Node subiu (teste: http://localhost:3000/health = `ok`).
- `✔ Túnel Cloudflare conectado.` → só aparece se você usa `TUNNEL_TOKEN` abaixo.
- `✔ ONLINE: https://gluglutelas.website está chegando neste servidor.` → o domínio chega até aqui.
- `✖ OFFLINE: ... (respondeu HTTP 502)` → o túnel existe mas não chega no servidor (porta errada?).
  `(sem resposta)` ou HTTP 530 → o túnel está desligado.
- `+ Fulano entrou (2 online)` / `- Fulano saiu` → movimento da sala.

## Túnel: escolha UM
1. **Serviço do Windows** (painel do Cloudflare mostra o comando com token): sobe com o PC.
   Deixe `TUNNEL_TOKEN` vazio.
2. **Junto com o servidor**: instale `cloudflared` (`winget install --id Cloudflare.cloudflared`),
   cole o token em `TUNNEL_TOKEN` no `.env`. O túnel liga e desliga com o `.bat`.

No painel, o Public Hostname deve ser `gluglutelas.website` → `HTTP` `localhost:3000` (mesma PORT do `.env`).

## Bot de música (GlugluBot)
Painel fixo acima do chat. Todo mundo na sala ouve a mesma música, sincronizada (quem entra depois cai no ponto certo).
O áudio é tocado localmente em cada navegador pelo player oficial do YouTube: não passa pelo servidor nem pela chamada.

Digite o nome da música ou cole um link (youtube.com, youtu.be, music.youtube.com, shorts). Para busca por nome, configure `YOUTUBE_API_KEY` no `.env` do servidor usando uma chave da YouTube Data API v3 (ative a API no Google Cloud). A chave fica só no servidor. Também use:
`/play <nome ou link>` · `/pause` · `/resume` · `/skip` · `/fila` · `/remover <nº>` · `/limpar` · `/tocando` · `/ajuda`

- **Volume, mudo e qualidade** são pessoais (só valem para você).
- **Qualidade:** o YouTube desativou a escolha por API em 2025. O seletor renderiza o player no tamanho da resolução pedida
  (o YouTube escolhe pela dimensão do player). É um pedido, não garantia. "Só áudio" esconde o vídeo e pede o mínimo de banda.
- O servidor precisa de internet de saída para consultar o título do vídeo (oEmbed). Sem isso a música toca, só sem o título.
- Alguns vídeos proíbem player externo (erro 101/150): o bot avisa e pula sozinho.

## Perfil e anexos
Clique na sua foto (ou no lápis, embaixo na barra) para editar nome, bio, foto e banner.
PNG, JPG, WEBP e **GIF animado** funcionam na foto e no banner. No chat, o clipe ao lado da mensagem
anexa fotos, GIFs e outros arquivos — **até 50 MB** cada, no máximo 8 por mensagem.
Os arquivos ficam na pasta de dados (padrão: `GlugluCall-dados` na sua pasta de usuário; veja `DATA_DIR` no `.env`). Ela fica fora do projeto: não vai para o git e não some ao atualizar a versão.

## Efeitos sonoros
Sintetizados no navegador (sem arquivos): entrar/sair da sala e da chamada (você e os outros), mutar/ensurdecer,
live (iniciar/encerrar/espectador), mensagens, conexão/queda e clique nos botões. Botão de sino no topo do palco liga/desliga.
Para mudar um som, edite `public/js/sfx.js` (objeto `SOUNDS`).

## Importante: Referrer-Policy
O player do YouTube dá **erro 153** se a página não enviar o `Referer`. Por isso o servidor agora usa
`strict-origin-when-cross-origin` (só a origem é enviada) e a CSP libera `www.youtube.com`. Se você usa um proxy na frente
(Caddy/nginx/Cloudflare), não sobrescreva esse cabeçalho com `no-referrer`.
