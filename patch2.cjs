const fs = require('fs');
let code = fs.readFileSync('src/components/VideoExportModal.tsx', 'utf8');

code = code.replace(
  "xhr.open('POST', (process.env.REACT_APP_EXPORT_SERVER_URL || 'http://localhost:4000') + '/api/video/export', true);",
  "xhr.open('POST', (process.env.REACT_APP_EXPORT_SERVER_URL || '') + '/api/video/export-capcut', true);"
);

fs.writeFileSync('src/components/VideoExportModal.tsx', code);
console.log('Patched URL');
