'use strict';
// Grava o ícone e o nome no .exe sem Wine (o sandbox não tem Wine).
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const PE = await import('pe-library');
  const ResEdit = await import('resedit');
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const iconPath = path.join(__dirname, 'icon.ico');
  const data = fs.readFileSync(exe);
  const bin = PE.NtExecutable.from(data);
  const res = PE.NtExecutableResource.from(bin);
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(iconPath));
  const icons = iconFile.icons.map((item) => item.data);
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const targets = groups.length ? groups : [{ id: 1, lang: 1033 }];
  for (const group of targets) {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, group.id, group.lang || 1033, icons);
  }
  for (const vi of ResEdit.Resource.VersionInfo.fromEntries(res.entries)) {
    vi.setFileVersion(1, 0, 0, 0, 1033);
    vi.setProductVersion(1, 0, 0, 0, 1033);
    vi.setStringValues(
      { lang: 1033, codepage: 1200 },
      {
        FileDescription: 'GlugluCall',
        ProductName: 'GlugluCall',
        CompanyName: 'Gluglutelas',
        InternalName: 'GlugluCall',
        OriginalFilename: 'GlugluCall.exe',
        LegalCopyright: 'Gluglutelas',
      }
    );
    vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(bin);
  const tmp = `${exe}.tmp`;
  fs.writeFileSync(tmp, Buffer.from(bin.generate()));
  fs.renameSync(tmp, exe);
};
