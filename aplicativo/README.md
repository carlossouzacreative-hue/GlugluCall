# GlugluCall – Convidado

App de desktop que abre direto `https://gluglutelas.website` (DOMAIN no `.env`).
Se o servidor estiver desligado, mostra "Servidor offline" e tenta de novo sozinho a cada 5 s.

## Para o convidado
Só baixa e executa `GlugluCall-Setup-1.0.0.exe`. Não precisa instalar mais nada
(o Electron já traz tudo dentro). O Windows pode avisar "protegeu seu PC" porque o instalador
não é assinado: clicar em "Mais informações" > "Executar assim mesmo".

## Para você (gerar o instalador) – precisa do Node.js 20+ no seu PC
- `testar-app.bat`        → abre o app sem instalar (para testar).
- `gerar-instalador.bat`  → cria `dist\GlugluCall-Setup-1.0.0.exe` (é esse arquivo que você manda).

Se o build reclamar de "symbolic link", abra o terminal como administrador
ou ative o Modo Desenvolvedor do Windows e rode de novo.

Para trocar o endereço do servidor, edite `DOMAIN` no `.env` e gere o instalador de novo.
