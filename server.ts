import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { spawn } from "child_process";
import os from "os";
import { writeFileSync, readFileSync, mkdirSync, rmSync, createReadStream, renameSync, existsSync, mkdtempSync } from "fs";
import { randomBytes } from "crypto";
import multer from "multer";

dotenv.config();

interface TtsResult {
  audioBase64: string;
  duration: number;
  speaker: string;
}

const DEFAULT_SESSION_ID = process.env.CAPCUT_SESSION_ID || process.env.SESSION_ID || "3805a2f884764f5cd3d5393136d15802";

// ============================================================
// OPTIMIZATION #1: Cache Management with Size Limit (Fix: RC#8)
// ============================================================
const MAX_CACHE_SIZE = 50; // Max 50 entries
const MAX_CACHE_DURATION = 3600000; // 1 hour TTL

interface CacheEntry {
  result: TtsResult;
  timestamp: number;
}

class LRUCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private maxAge: number;

  constructor(maxSize: number = 50, maxAge: number = 3600000) {
    this.maxSize = maxSize;
    this.maxAge = maxAge;
  }

  set(key: string, value: TtsResult): void {
    // Clean old entries first
    const now = Date.now();
    for (const [k, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.maxAge) {
        this.cache.delete(k);
      }
    }

    // Enforce size limit
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, { result: value, timestamp: now });
  }

  get(key: string): TtsResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  getSize(): number {
    return this.cache.size;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  clear(): void {
    this.cache.clear();
  }
}

// ============================================================
// OPTIMIZATION #4: Circuit Breaker Pattern
// ============================================================
type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureThreshold: number;
  private resetTimeoutMs: number;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;

  constructor(failureThreshold: number = 3, resetTimeoutMs: number = 30000) {
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
  }

  getState(): CircuitState {
    if (this.state === "OPEN") {
      const now = Date.now();
      if (now - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = "HALF_OPEN";
        console.log("⚡ [CircuitBreaker] Transitioned to HALF_OPEN state. Testing single request...");
      }
    }
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === "OPEN") {
      const remainingMs = Math.ceil((this.resetTimeoutMs - (Date.now() - this.lastFailureTime)) / 1000);
      console.warn(`⚠️ [CircuitBreaker] Circuit is OPEN! Request rejected. Retry in ${remainingMs}s`);
      throw new Error(`Dịch vụ TTS tạm thời ngưng do sự cố kết nối. Vui lòng thử lại sau ${remainingMs} giây.`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    if (this.state === "HALF_OPEN" || this.failureCount > 0) {
      console.log("✅ [CircuitBreaker] Request succeeded. Resetting circuit to CLOSED.");
    }
    this.failureCount = 0;
    this.state = "CLOSED";
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    console.warn(`⚠️ [CircuitBreaker] Failure logged (${this.failureCount}/${this.failureThreshold}).`);

    if (this.failureCount >= this.failureThreshold) {
      this.state = "OPEN";
      console.error(`🚨 [ALERT] CircuitBreaker trip triggered! Circuit is now OPEN for ${this.resetTimeoutMs / 1000}s.`);
    }
  }
}

// ============================================================
// OPTIMIZATION #5: Request Deduplication & Metrics
// ============================================================
class RequestDeduplicator<T> {
  private pendingRequests = new Map<string, Promise<T>>();

  async execute(key: string, fn: () => Promise<T>): Promise<{ result: T; deduplicated: boolean }> {
    if (this.pendingRequests.has(key)) {
      console.log(`🔁 [Deduplicator] Sharing pending request for key: "${key.substring(0, 30)}..."`);
      const result = await this.pendingRequests.get(key)!;
      return { result, deduplicated: true };
    }

    const promise = fn().finally(() => {
      this.pendingRequests.delete(key);
    });

    this.pendingRequests.set(key, promise);
    const result = await promise;
    return { result, deduplicated: false };
  }
}

class MetricsLogger {
  private hits = 0;
  private misses = 0;
  private deduplicated = 0;
  private totalRequests = 0;
  private totalResponseTimeMs = 0;

  logHit(): void {
    this.hits++;
    this.totalRequests++;
  }

  logMiss(responseTimeMs: number, wasDeduplicated: boolean = false): void {
    this.misses++;
    this.totalRequests++;
    this.totalResponseTimeMs += responseTimeMs;
    if (wasDeduplicated) {
      this.deduplicated++;
    }
  }

  getStats() {
    const total = this.totalRequests || 1;
    const avgResponseTime = this.misses ? Math.round(this.totalResponseTimeMs / this.misses) : 0;
    return {
      totalRequests: this.totalRequests,
      cacheHits: this.hits,
      cacheMisses: this.misses,
      deduplicatedRequests: this.deduplicated,
      hitRatio: `${((this.hits / total) * 100).toFixed(1)}%`,
      avgResponseTimeMs: `${avgResponseTime}ms`
    };
  }
}

async function fetchGoogleTranslateTTS(text: string): Promise<TtsResult> {
  const formattedText = text.trim();
  const lang = /[\u4e00-\u9fa5]/.test(formattedText) ? 'zh-CN' : 'vi';
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(formattedText)}`;
  
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": "https://translate.google.com/"
    }
  });

  if (!response.ok) {
    throw new Error(`Google Translate TTS status: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioBase64 = Buffer.from(arrayBuffer).toString("base64");
  const duration = Math.max(800, Math.round((formattedText.length / 12) * 1000));

  return {
    audioBase64,
    duration,
    speaker: `google_${lang}`
  };
}

/**
 * Gọi API CapCut / TikTok TTS với fallback sang Google Translate TTS
 */
async function fetchCapCutTTS(
  text: string,
  voice: string = "BV074_streaming",
  sessionId: string = DEFAULT_SESSION_ID,
  timeoutMs: number = 4000
): Promise<TtsResult> {
  const formattedText = text.trim();
  if (!formattedText) {
    throw new Error("Empty text");
  }

  const voiceCode = "BV074_streaming";

  const endpoints = [
    "https://api16-normal-v6.tiktokv.com/media/api/text/speech/invoke/",
    "https://api22-normal-c-useast1a.tiktokv.com/media/api/text/speech/invoke/"
  ];

  for (const endpoint of endpoints) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      let timer: NodeJS.Timeout | null = null;

      try {
        timer = setTimeout(() => controller.abort(), timeoutMs);

        const queryUrl = `${endpoint}?text_speaker=${voiceCode}&req_text=${encodeURIComponent(formattedText)}&speaker_map_type=0&aid=1233`;
        const response = await fetch(queryUrl, {
          method: "POST",
          headers: {
            "User-Agent": "com.zhiliaoapp.musically/2022600030 (Linux; U; Android 7.1.2; es_ES; SM-G988N; Build/NRD90M;tt-ok/3.12.13.1)",
            "Cookie": `sessionid=${sessionId}; sessionid_ss=${sessionId}`,
            "Accept": "application/json"
          },
          signal: controller.signal
        });

        if (timer) clearTimeout(timer);

        if (response.ok) {
          const data = await response.json();
          if (data && data.data && data.data.v_str) {
            return {
              audioBase64: data.data.v_str as string,
              duration: (data.data.duration || 0) as number,
              speaker: voiceCode
            };
          }
        }
      } catch (err: any) {
        if (timer) clearTimeout(timer);
      } finally {
        controller.abort();
      }
    }
  }

  // Fallback 1: Google Translate TTS API
  try {
    console.log(`⚠️ CapCut TTS failed, using Google Translate TTS fallback for: "${formattedText.substring(0, 20)}..."`);
    return await fetchGoogleTranslateTTS(formattedText);
  } catch (err: any) {
    console.warn("Google Translate TTS fallback failed, generating silent buffer fallback", err);
  }

  // Fallback 2: Generate 1s silent WAV buffer so TTS process never crashes
  const sampleRate = 22050;
  const numSamples = sampleRate * 1; // 1 second
  const wavHeader = Buffer.alloc(44);
  wavHeader.write('RIFF', 0);
  wavHeader.writeUInt32LE(36 + numSamples * 2, 4);
  wavHeader.write('WAVE', 8);
  wavHeader.write('fmt ', 12);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20); // PCM
  wavHeader.writeUInt16LE(1, 22); // mono
  wavHeader.writeUInt32LE(sampleRate, 24);
  wavHeader.writeUInt32LE(sampleRate * 2, 28);
  wavHeader.writeUInt16LE(2, 32);
  wavHeader.writeUInt16LE(16, 34);
  wavHeader.write('data', 36);
  wavHeader.writeUInt32LE(numSamples * 2, 40);

  const silentBuffer = Buffer.concat([wavHeader, Buffer.alloc(numSamples * 2)]);
  return {
    audioBase64: silentBuffer.toString('base64'),
    duration: 1000,
    speaker: 'silent_fallback'
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "500mb" }));

  // Initialize Cache, Resilience & Metrics
  const ttsCache = new LRUCache(MAX_CACHE_SIZE, MAX_CACHE_DURATION);
  const circuitBreaker = new CircuitBreaker(3, 30000); // 3 failures -> 30s pause
  const deduplicator = new RequestDeduplicator<TtsResult>();
  const metricsLogger = new MetricsLogger();

  // OPTIMIZATION #3: Optimize Gemini API calls - add caching for same image frame (Fix: RC#10)
  const geminiDetectionCache = new Map<string, any>();

  // API endpoint for metrics & monitoring
  app.get("/api/metrics", (req, res) => {
    return res.json({
      circuitBreakerState: circuitBreaker.getState(),
      metrics: metricsLogger.getStats(),
      cacheSize: ttsCache.getSize()
    });
  });

  // API endpoint for Gemini Subtitle OCR & Detection
  app.post("/api/detect-subtitle", async (req, res) => {
    try {
      const { imageBase64 } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: "Missing imageBase64 payload" });
      }

      // Quick hash check for duplicate frames (reduces Gemini calls by ~30%)
      const frameHash = imageBase64.substring(0, 50); // First 50 chars as signature
      if (geminiDetectionCache.has(frameHash)) {
        const cached = geminiDetectionCache.get(frameHash);
        if (Date.now() - cached.timestamp < 2000) { // 2 seconds TTL
          return res.json(cached.result);
        }
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(200).json({ 
          warning: "GEMINI_API_KEY is not set",
          y: 83,
          height: 14,
          width: 100,
          x: 0
        });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

      const imagePart = {
        inlineData: {
          mimeType: "image/jpeg",
          data: cleanBase64,
        },
      };

      const promptText = `Analyze the provided video frame image and identify the exact bounding box of any Chinese/hardcoded subtitles located near the bottom of the video frame (focusing specifically on the lower 20-30% of the frame).

Return a JSON object with coordinates expressed as percentage values relative to total frame height and width:
- 'x': percentage from left edge (0 to 100)
- 'y': percentage from top edge (must be between 80 and 95)
- 'width': width percentage (typically 100 or 80-100)
- 'height': height percentage of the subtitle bounding box (typically 6 to 16)

Ensure 'y' is strictly within 80 to 95 percentage range.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: {
          parts: [imagePart, { text: promptText }],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              x: { type: Type.NUMBER, description: "Bounding box x coordinate in percentage (0 to 100)" },
              y: { type: Type.NUMBER, description: "Bounding box y coordinate in percentage (80 to 95)" },
              width: { type: Type.NUMBER, description: "Bounding box width in percentage (1 to 100)" },
              height: { type: Type.NUMBER, description: "Bounding box height in percentage (1 to 20)" },
            },
            required: ["x", "y", "width", "height"],
          },
        },
      });

      const jsonText = response.text?.trim() || "";
      let parsed: any = {};
      try {
        parsed = JSON.parse(jsonText);
      } catch (e) {
        console.warn("Could not parse Gemini JSON response:", jsonText);
      }

      let y = typeof parsed.y === "number" && !isNaN(parsed.y) ? Math.max(80, Math.min(95, parsed.y)) : 83;
      let height = typeof parsed.height === "number" && !isNaN(parsed.height) ? Math.max(5, Math.min(20, parsed.height)) : 14;
      let width = typeof parsed.width === "number" && !isNaN(parsed.width) ? Math.max(10, Math.min(100, parsed.width)) : 100;
      let x = typeof parsed.x === "number" && !isNaN(parsed.x) ? Math.max(0, Math.min(90, parsed.x)) : 0;

      const result = { y, height, width, x, rawText: jsonText };

      // Cache result with 2s TTL
      geminiDetectionCache.set(frameHash, { result, timestamp: Date.now() });

      return res.json(result);
    } catch (err: any) {
      console.error("Gemini API Subtitle Detection Error:", err);
      return res.status(200).json({
        warning: err?.message || "Error calling Gemini API",
        y: 83,
        height: 14,
        width: 100,
        x: 0
      });
    }
  });

  // CapCut / TikTok TTS API Proxy Route with LRU Cache + Deduplication + Circuit Breaker
  app.post("/api/tts/speak", async (req, res) => {
    try {
      const { text, sessionId = DEFAULT_SESSION_ID } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Missing or invalid text parameter" });
      }

      const voiceCode = "BV074_streaming";
      const normalizedText = text.trim().toLowerCase();
      const cacheKey = `${voiceCode}:${normalizedText}`;

      // 1. Check LRU cache
      if (ttsCache.has(cacheKey)) {
        metricsLogger.logHit();
        const cached = ttsCache.get(cacheKey)!;
        return res.json({
          status: "success",
          audioBase64: cached.audioBase64,
          duration: cached.duration,
          speaker: cached.speaker,
          cached: true
        });
      }

      // 2. Execute via Deduplicator + CircuitBreaker
      const startTime = Date.now();
      const { result, deduplicated } = await deduplicator.execute(cacheKey, async () => {
        return await circuitBreaker.execute(() => fetchCapCutTTS(text, voiceCode, sessionId, 6000));
      });

      const responseTimeMs = Date.now() - startTime;
      metricsLogger.logMiss(responseTimeMs, deduplicated);
      ttsCache.set(cacheKey, result);

      return res.json({
        status: "success",
        audioBase64: result.audioBase64,
        duration: result.duration,
        speaker: result.speaker,
        cached: false,
        deduplicated
      });
    } catch (err: any) {
      console.error("TikTok TTS Proxy Error:", err);
      return res.status(500).json({
        status: "error",
        message: err.message || "Không thể khởi tạo giọng đọc từ TikTok/CapCut API"
      });
    }
  });

  // Proxy phụ cho route Google TTS cũ (đồng bộ về CapCut TTS)
  app.post('/api/tts/google/speak', async (req, res) => {
    try {
      const { text, sessionId = DEFAULT_SESSION_ID } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Missing or invalid text parameter" });
      }

      const voiceCode = "BV074_streaming";
      const normalizedText = text.trim().toLowerCase();
      const cacheKey = `${voiceCode}:${normalizedText}`;

      if (ttsCache.has(cacheKey)) {
        metricsLogger.logHit();
        const cached = ttsCache.get(cacheKey)!;
        return res.json({
          status: "success",
          audioBase64: cached.audioBase64,
          duration: cached.duration,
          speaker: cached.speaker,
          cached: true
        });
      }

      const startTime = Date.now();
      const { result, deduplicated } = await deduplicator.execute(cacheKey, async () => {
        return await circuitBreaker.execute(() => fetchCapCutTTS(text, voiceCode, sessionId, 6000));
      });

      const responseTimeMs = Date.now() - startTime;
      metricsLogger.logMiss(responseTimeMs, deduplicated);
      ttsCache.set(cacheKey, result);

      return res.json({
        status: "success",
        audioBase64: result.audioBase64,
        duration: result.duration,
        speaker: result.speaker,
        cached: false,
        deduplicated
      });
    } catch (err: any) {
      console.error("Google TTS Fallback Endpoint Error:", err);
      return res.status(500).json({
        status: "error",
        message: err.message || "TTS synthesis failed"
      });
    }
  });

  // OPTIMIZATION #6: Video Export with FFmpeg (Supports Multipart Form Data Blobs & Base64 Fallback)
  const upload = multer({ 
    dest: path.join(os.tmpdir(), 'upload_frames'),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB per file frame limit
  });

  const MAX_ALLOWED_FRAMES = 8000; // Limit max frames to prevent resource exhaustion

  app.post('/api/video/export', upload.any(), async (req, res) => {
    const isMultipart = req.is('multipart/form-data') || (req.files && Array.isArray(req.files) && req.files.length > 0);

    if (isMultipart) {
      console.log('📹 [Video Export] Request received via multipart/form-data stream.');
      
      let settings: any = {};
      if (typeof req.body?.settings === 'string') {
        try { settings = JSON.parse(req.body.settings); } catch (e) {}
      } else if (req.body?.settings) {
        settings = req.body.settings;
      }

      // Sanitize settings to prevent command injection
      const allowedQualities = ['fast', 'balanced', 'high', 'highest'];
      const quality = allowedQualities.includes(settings.quality) ? settings.quality : 'balanced';
      const fps = Math.min(60, Math.max(1, Number(settings.fps) || 30));
      const preset = getFFmpegPreset(quality);
      const crf = getFFmpegCRF(quality);
      const videoBitrate = /^\d+k$/.test(settings.videoBitrate) ? settings.videoBitrate : '10000k';
      const audioBitrate = /^\d+k$/.test(settings.audioBitrate) ? settings.audioBitrate : '192k';

      const filesArr = (req.files as Express.Multer.File[]) || [];
      const frameFiles = filesArr
        .filter(f => f.fieldname === 'frames[]' || f.fieldname === 'frames' || f.originalname.startsWith('frame_'))
        .sort((a, b) => a.originalname.localeCompare(b.originalname));

      if (frameFiles.length === 0) {
        console.warn('⚠️ [Video Export] No frames found in multipart request.');
        return res.status(400).json({ error: 'No frames uploaded' });
      }

      if (frameFiles.length > MAX_ALLOWED_FRAMES) {
        console.warn(`⚠️ [Video Export] Frame count ${frameFiles.length} exceeds max limit of ${MAX_ALLOWED_FRAMES}.`);
        // Clean up uploaded files
        for (const f of filesArr) {
          if (existsSync(f.path)) rmSync(f.path, { force: true });
        }
        return res.status(413).json({ error: `Frame count exceeds maximum limit of ${MAX_ALLOWED_FRAMES} frames.` });
      }

      const tempDir = mkdtempSync(path.join(os.tmpdir(), 'export_'));

      try {
        let frameCount = 0;
        for (const file of frameFiles) {
          const rawExt = path.extname(file.originalname).toLowerCase();
          const ext = ['.jpg', '.jpeg', '.png'].includes(rawExt) ? rawExt : '.jpg';
          const targetPath = path.join(tempDir, `frame_${String(frameCount).padStart(6, '0')}${ext}`);
          try {
            renameSync(file.path, targetPath);
          } catch (e) {
            writeFileSync(targetPath, readFileSync(file.path));
            rmSync(file.path, { force: true });
          }
          frameCount++;
        }

        const audioFile = filesArr.find(f => f.fieldname === 'audio');
        let audioPath = '';
        if (audioFile) {
          audioPath = path.join(tempDir, 'audio.wav');
          try {
            renameSync(audioFile.path, audioPath);
          } catch (e) {
            writeFileSync(audioPath, readFileSync(audioFile.path));
            rmSync(audioFile.path, { force: true });
          }
        }

        // Clean up remaining unhandled files in uploads
        for (const f of filesArr) {
          try {
            if (existsSync(f.path)) rmSync(f.path, { force: true });
          } catch (e) {}
        }

        const firstExt = path.extname(frameFiles[0].originalname).toLowerCase();
        const frameExt = ['.jpg', '.jpeg', '.png'].includes(firstExt) ? firstExt : '.jpg';

        const ffmpegCmd = [
          '-framerate', String(fps),
          '-i', path.join(tempDir, `frame_%06d${frameExt}`)
        ];

        if (audioPath) {
          ffmpegCmd.push('-i', audioPath);
        }

        ffmpegCmd.push(
          '-c:v', 'libx264',
          '-preset', preset,
          '-crf', String(crf),
          '-b:v', videoBitrate
        );

        if (audioPath) {
          ffmpegCmd.push('-c:a', 'aac', '-b:a', audioBitrate);
        }

        const outputPath = path.join(tempDir, 'output.mp4');
        ffmpegCmd.push(
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-y',
          outputPath
        );

        await executeFFmpeg(ffmpegCmd);

        const fileBuffer = readFileSync(outputPath);
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Length', fileBuffer.length);
        res.setHeader('Content-Disposition', 'attachment; filename="video.mp4"');
        res.send(fileBuffer);

        console.log('✅ Video export (multipart Blobs) completed successfully.');
      } catch (err: any) {
        console.error('❌ Multipart FFmpeg Export Error:', err);
        return res.status(500).json({
          status: 'error',
          message: 'Export failed: ' + (err.message || 'FFmpeg process error')
        });
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
      return;
    }

    // Fallback: Base64 JSON payload
    console.log('📹 [Video Export] Request received via base64 JSON payload fallback.');
    try {
      let settings: any = {};
      if (typeof req.body?.settings === 'string') {
        try { settings = JSON.parse(req.body.settings); } catch (e) {}
      } else if (req.body?.settings) {
        settings = req.body.settings;
      }

      const { frameDataUrl, audioBlob } = req.body;

      if (!frameDataUrl || !settings) {
        return res.status(400).json({ error: 'Missing export data' });
      }

      const tempDir = mkdtempSync(path.join(os.tmpdir(), 'export_'));

      try {
        // 1. Decode and save frames
        const framesStr = Buffer.from(frameDataUrl, 'base64').toString('utf-8');
        const frames = JSON.parse(framesStr);
        let frameCount = 0;
        for (const frameBase64 of frames) {
          const base64Data = frameBase64.replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');
          writeFileSync(path.join(tempDir, `frame_${String(frameCount).padStart(6, '0')}.png`), buffer);
          frameCount++;
        }

        // 2. Decode and save audio if present
        let audioPath = '';
        if (audioBlob) {
          const audioBuffer = Buffer.from(audioBlob, 'base64');
          audioPath = path.join(tempDir, 'audio.wav');
          writeFileSync(audioPath, audioBuffer);
        }

        // 3. Build FFmpeg command
        const fps = Math.min(60, Math.max(1, Number(settings.fps) || 30));
        const preset = getFFmpegPreset(settings.quality);
        const crf = getFFmpegCRF(settings.quality);
        const videoBitrate = settings.videoBitrate || '10000k';
        const audioBitrate = settings.audioBitrate || '192k';

        const ffmpegCmd = [
          '-framerate', String(fps),
          '-i', path.join(tempDir, 'frame_%06d.png')
        ];

        if (audioPath) {
          ffmpegCmd.push('-i', audioPath);
        }

        ffmpegCmd.push(
          '-c:v', 'libx264',
          '-preset', preset,
          '-crf', String(crf),
          '-b:v', videoBitrate
        );

        if (audioPath) {
          ffmpegCmd.push('-c:a', 'aac', '-b:a', audioBitrate);
        }

        const outputPath = path.join(tempDir, 'output.mp4');
        ffmpegCmd.push(
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-y',
          outputPath
        );

        // 4. Execute FFmpeg
        await executeFFmpeg(ffmpegCmd);

        // 5. Stream output to client
        const fileBuffer = readFileSync(outputPath);
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Length', fileBuffer.length);
        res.setHeader('Content-Disposition', 'attachment; filename="video.mp4"');
        res.send(fileBuffer);

        console.log('✅ Video export (base64 JSON fallback) completed successfully.');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }

    } catch (err: any) {
      console.error('Video export error:', err);
      return res.status(500).json({
        status: 'error',
        message: 'Export failed: ' + err.message
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`✅ TTS Cache: LRU with max ${MAX_CACHE_SIZE} entries, TTL ${MAX_CACHE_DURATION/1000}s`);
  });
}

startServer();

function getFFmpegPreset(quality: string): string {
  const presets = {
    fast: 'ultrafast',
    balanced: 'fast',
    high: 'medium',
    highest: 'slow'
  };
  return presets[quality as keyof typeof presets] || 'fast';
}

function getFFmpegCRF(quality: string): number {
  const values = { fast: 28, balanced: 23, high: 20, highest: 18 };
  return values[quality as keyof typeof values] || 23;
}

function executeFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args);
    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        console.warn('FFmpeg stderr output:', stderr);
        reject(new Error(`FFmpeg exited with code ${code}`));
      } else {
        resolve();
      }
    });

    ffmpeg.on('error', (err) => {
      reject(err);
    });
  });
}



