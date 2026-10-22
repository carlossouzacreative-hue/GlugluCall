# GlugluCall V8

Servidor e aplicativo desktop para chat/voz com música sincronizada (YouTube), autenticação por e-mail, perfis, uploads e túnel Cloudflare.

## Estrutura

- **servidor/** — Node.js + Express + Socket.IO. Roda no PC do anfitrião. Veja `servidor/README.md`.
- **aplicativo/** — Cliente Electron (Windows). Gera instalador. Veja `aplicativo/README.md`.

## Como começar

1. Entre na pasta `servidor`, copie `.env.example` para `.env` e configure (SMTP, YouTube API, etc.).
2. Rode `iniciar-servidor.bat` ou `npm install && npm start`.
3. Para o app desktop, entre em `aplicativo` e use `gerar-instalador.bat`.

Dados de usuários, sessões e uploads ficam fora do repositório (pasta `GlugluCall-dados` no home do usuário).

---

Repositório criado a partir do GlugluCallV8.zip.
