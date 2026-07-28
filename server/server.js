const express = require('express');
const multer = require('multer');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const rimraf = require('rimraf');
const cors = require('cors');
const srtToAss = require('./utils/srt-to-ass');

const app = express();
app.use(cors());

// multer config (store in OS tmp first)
const upload = multer({ dest: os.tmpdir() });

// helper: safe move
function moveFile(oldPath, newPath) {
  fs.renameSync(oldPath, newPath);
}

// helper: cleanup
function safeRmDir(dir) {
  try { rimraf.sync(dir); } catch(e) { /* ignore */ }
}

// helper: escape string for ffmpeg filter
function escapePath(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

app.post('/api/video/export', upload.fields([
  { name: 'video', maxCount: 1 }, 
  { name: 'subtitle', maxCount: 1 }, 
  { name: 'logo', maxCount: 1 },
  { name: 'font', maxCount: 1 }
]), async (req, res) => {
  // Basic validation
  if (!req.files || !req.files.video || req.files.video.length === 0) {
    return res.status(400).json({ error: 'Missing video file' });
  }

  const videoFile = req.files.video[0];
  const subtitleFile = req.files.subtitle && req.files.subtitle[0];
  const logoFile = req.files.logo && req.files.logo[0];
  const fontFile = req.files.font && req.files.font[0];

  // Limit sizes
  const MAX_VIDEO_BYTES = 1_200_000_000; // ~1.2GB
  const MAX_SUB_BYTES = 5_000_000;
  const MAX_FONT_BYTES = 5_000_000;
  const MAX_LOGO_BYTES = 20_000_000;

  if (videoFile.size > MAX_VIDEO_BYTES) {
    try { fs.unlinkSync(videoFile.path); } catch(e){}
    return res.status(413).json({ error: 'Video too large' });
  }
  if (subtitleFile && subtitleFile.size > MAX_SUB_BYTES) return res.status(413).json({ error: 'Subtitle too large' });
  if (fontFile && fontFile.size > MAX_FONT_BYTES) return res.status(413).json({ error: 'Font too large' });
  if (logoFile && logoFile.size > MAX_LOGO_BYTES) return res.status(413).json({ error: 'Logo too large' });

  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'sda-export-'));
  try {
    // move uploaded files into tmpBase with fixed names
    const inputPath = path.join(tmpBase, 'input' + path.extname(videoFile.originalname || '.mp4'));
    moveFile(videoFile.path, inputPath);

    let settings = {};
    try {
      if (req.body.settings) settings = JSON.parse(req.body.settings);
    } catch(e) {
      settings = {};
    }

    let assPath = null;
    let fontsDir = null;

    if (fontFile) {
      fontsDir = path.join(tmpBase, 'fonts');
      fs.mkdirSync(fontsDir);
      const fontPath = path.join(fontsDir, fontFile.originalname || 'custom.ttf');
      moveFile(fontFile.path, fontPath);
    }

    if (subtitleFile) {
      const srtPath = path.join(tmpBase, 'subtitle.srt');
      moveFile(subtitleFile.path, srtPath);
      const srtText = fs.readFileSync(srtPath, 'utf8');
      const assContent = srtToAss(srtText, settings);
      assPath = path.join(tmpBase, 'subtitle.ass');
      fs.writeFileSync(assPath, assContent);
    }

    let logoPath = null;
    if (logoFile) {
      logoPath = path.join(tmpBase, 'logo' + path.extname(logoFile.originalname || '.png'));
      moveFile(logoFile.path, logoPath);
    }

    const outputPath = path.join(tmpBase, 'output.mp4');

    const preset = settings.preset || 'fast';
    const crf = String(settings.crf || 23);
    const logoPos = settings.logoPos || { x: 'main_w-overlay_w-10', y: '10' };

    let filters = [];
    
    // step A: Background bar (only if subtitles are enabled maybe? Or always based on settings?)
    if (subtitleFile && settings.barHeightPercent) {
      const barHeight = `ih*${settings.barHeightPercent || 0.12}`;
      const opacity = settings.barOpacity || 0.5;
      filters.push(`drawbox=x=0:y=ih-${barHeight}:w=iw:h=${barHeight}:color=black@${opacity}:t=fill`);
    }

    // step B: Subtitles
    if (assPath) {
      const escAssPath = escapePath(assPath);
      let assFilter = `ass=${escAssPath}`;
      if (fontsDir) {
        assFilter += `:fontsdir=${escapePath(fontsDir)}`;
      }
      filters.push(assFilter);
    }

    let ffArgs = ['-y', '-i', inputPath];
    
    if (logoPath) {
      ffArgs.push('-i', logoPath);
    }

    if (filters.length > 0 || logoPath) {
      let filterStr = '';
      if (filters.length > 0) {
        filterStr += `[0:v]${filters.join(',')}[v1]`;
      }
      
      if (logoPath) {
        if (filters.length > 0) {
          filterStr += `;[v1][1:v]overlay=${logoPos.x}:${logoPos.y}`;
        } else {
          filterStr = `[0:v][1:v]overlay=${logoPos.x}:${logoPos.y}`;
        }
      } else {
        filterStr = filterStr.replace(/\[v1\]$/, ''); // Remove output pad if no logo and just filters
      }
      
      ffArgs.push('-filter_complex', filterStr);
    }

    ffArgs.push('-map', '0:a?', '-c:v', 'libx264', '-preset', preset, '-crf', crf, '-c:a', 'aac', '-b:a', '192k', outputPath);

    // spawn ffmpeg
    const ff = spawn('ffmpeg', ffArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    ff.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    ff.on('error', (err) => { console.error('ffmpeg spawn error', err); });

    const exitCode = await new Promise((resolve) => ff.on('close', resolve));

    if (exitCode !== 0) {
      console.error('ffmpeg failed:', stderr);
      return res.status(500).json({ error: 'ffmpeg failed', details: stderr.slice(-8000) });
    }

    // Stream output back to client
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="exported-capcut.mp4"');
    const readStream = fs.createReadStream(outputPath);
    readStream.pipe(res);
    readStream.on('close', () => {
      // cleanup in background
      safeRmDir(tmpBase);
    });
  } catch (err) {
    safeRmDir(tmpBase);
    console.error('export error', err);
    res.status(500).json({ error: 'internal server error' });
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Export server listening on ${port}`));
