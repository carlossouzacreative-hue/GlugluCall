'use strict';
// Pasta de DADOS (contas, sessões, chats, servidores, uploads, perfis).
// Fica FORA da pasta do código, então trocar/atualizar a versão do servidor não apaga nada,
// e como não está dentro do projeto, nunca vai para o GitHub.
// Padrão: <sua pasta de usuário>/GlugluCall-dados   (mude com DATA_DIR no .env, se quiser).
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(os.homedir(), 'GlugluCall-dados');

// Migração única: se existe a antiga ./data (versões até a V7) e a nova pasta ainda não existe, copia.
const OLD = path.join(__dirname, 'data');
try {
  if (!fs.existsSync(DATA) && fs.existsSync(OLD)) fs.cpSync(OLD, DATA, { recursive: true });
} catch (e) { console.warn('[dados] não consegui migrar ./data:', e.message); }
fs.mkdirSync(DATA, { recursive: true });

module.exports = { DATA };
