// Envio de arquivos (perfil e chat). O limite de 50 MB é conferido aqui e no servidor.
export const MAX_BYTES = 50 * 1024 * 1024;

let token = '';
export function setUploadToken(t) { token = t || ''; }

export function uploadFile(file, kind, onProgress) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('Nenhum arquivo.'));
    if (file.size > MAX_BYTES) return reject(new Error('O arquivo passa de 50 MB.'));
    if (!token) return reject(new Error('Ainda conectando. Tente de novo em um segundo.'));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/upload?kind=${encodeURIComponent(kind || 'chat')}`);
    xhr.setRequestHeader('x-upload-token', token);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText || '{}'); } catch { /* segue */ }
      if (xhr.status >= 200 && xhr.status < 300 && data.url) resolve(data);
      else reject(new Error(data.error || 'Falha no envio.'));
    };
    xhr.onerror = () => reject(new Error('Falha no envio.'));
    const fd = new FormData();
    fd.append('file', file, file.name);
    xhr.send(fd);
  });
}
