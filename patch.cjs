const fs = require('fs');
let code = fs.readFileSync('src/components/VideoExportModal.tsx', 'utf8');

code = code.replace(
  'const handleExportServerSide = async (vFile: File | null, sFile: File | null, lFile: File | null, expSettings: any) => {',
  'const handleExportServerSide = async (vFile: File | null, sFile: File | null, fontFile: File | null, lFile: File | null, expSettings: any) => {'
);

code = code.replace(
  'if (lFile) form.append(\'logo\', lFile, lFile.name);',
  'if (fontFile) form.append(\'font\', fontFile, fontFile.name);\n    if (lFile) form.append(\'logo\', lFile, lFile.name);'
);

code = code.replace(
  "a.download = 'exported.mp4';",
  "a.download = 'exported-capcut.mp4';"
);

code = code.replace(
  'await handleExportServerSide(videoFile, subtitleFile, logoFile, expSettings);',
  'await handleExportServerSide(videoFile, subtitleFile, null, logoFile, expSettings); // Pass fontFile if you have it in context'
);

fs.writeFileSync('src/components/VideoExportModal.tsx', code);
console.log('Patched frontend');
