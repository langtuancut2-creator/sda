const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  "app.post('/api/video/export-capcut', upload.fields([",
  "const uploadVideo = multer({ dest: path.join(os.tmpdir(), 'upload_video'), limits: { fileSize: 2000 * 1024 * 1024 } });\n  app.post('/api/video/export-capcut', uploadVideo.fields(["
);

fs.writeFileSync('server.ts', code);
console.log('Patched multer limits for capcut export');
