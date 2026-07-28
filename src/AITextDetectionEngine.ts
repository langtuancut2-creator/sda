/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SubtitleDetectionResult {
  x: number;       // Percentage X (0 for full-width)
  y: number;       // Percentage Y (top offset)
  w: number;       // Percentage Width (100 for full-width)
  h: number;       // Percentage Height
  yMinPx: number;  // Absolute pixel Y_Min on internal canvas
  yMaxPx: number;  // Absolute pixel Y_Max on internal canvas
  heightPx: number; // Absolute pixel Height
  isClamped: boolean;
  statusMessage: string;
}

export class AITextDetectionEngine {
  // PERF: Reuse static offscreen canvas to prevent GPU texture allocation/deallocation every 333ms | Fix: RC#1
  private static cachedCanvas: HTMLCanvasElement | null = null;
  private static cachedCtx: CanvasRenderingContext2D | null = null;

  // PERF: Reuse static offscreen canvas for Gemini frame capture | Fix: RC#1
  private static cachedGeminiCanvas: HTMLCanvasElement | null = null;
  private static cachedGeminiCtx: CanvasRenderingContext2D | null = null;

  /**
   * Gemini API-Powered Subtitle Box Detection
   * Captures the current video frame as base64 JPEG, sends to Gemini API,
   * parses JSON response {"y": number, "height": number, "width": number, "x": number},
   * and returns percentage-based coordinates for auto-blurring.
   */
  public static async detectChineseSubtitleBoxWithGemini(
    videoEl: HTMLVideoElement,
    previewCanvas?: HTMLCanvasElement | null
  ): Promise<{ x: number; y: number; width: number; height: number; statusMessage: string }> {
    const vw = videoEl.videoWidth || 1280;
    const vh = videoEl.videoHeight || 720;

    // PERF: Reuse static canvas to eliminate GPU texture reallocation during Gemini snapshot | Fix: RC#1
    if (!AITextDetectionEngine.cachedGeminiCanvas) {
      AITextDetectionEngine.cachedGeminiCanvas = document.createElement('canvas');
      AITextDetectionEngine.cachedGeminiCtx = AITextDetectionEngine.cachedGeminiCanvas.getContext('2d');
    }
    if (AITextDetectionEngine.cachedGeminiCanvas.width !== vw || AITextDetectionEngine.cachedGeminiCanvas.height !== vh) {
      AITextDetectionEngine.cachedGeminiCanvas.width = vw;
      AITextDetectionEngine.cachedGeminiCanvas.height = vh;
    }

    const ctx = AITextDetectionEngine.cachedGeminiCtx;
    try {
      if (ctx) {
        ctx.drawImage(videoEl, 0, 0, vw, vh);
      }
      const base64Image = AITextDetectionEngine.cachedGeminiCanvas.toDataURL('image/jpeg', 0.85);

      const response = await fetch('/api/detect-subtitle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64Image }),
      });

      if (!response.ok) {
        throw new Error(`API Error HTTP ${response.status}`);
      }

      const data = await response.json();

      let rawYPct = typeof data.y === 'number' && !isNaN(data.y) ? Math.max(70, Math.min(95, data.y)) : 83;
      let rawHeightPct = typeof data.height === 'number' && !isNaN(data.height) ? Math.max(5, Math.min(25, data.height)) : 14;
      let width = typeof data.width === 'number' && !isNaN(data.width) ? Math.max(10, Math.min(100, data.width)) : 100;
      let x = typeof data.x === 'number' && !isNaN(data.x) ? Math.max(0, Math.min(90, data.x)) : 0;

      // --- Tăng Biên độ Che phủ (Padding & Margin Adjustment) ---
      // Dịch chuyển y lên trên 12px (y = y - 12px), đồng thời cộng 24px vào height (height = height + 24px)
      const rawYPx = (rawYPct / 100) * vh;
      const rawHPx = (rawHeightPct / 100) * vh;

      const adjustedYPx = Math.max(0, rawYPx - 12);
      const adjustedHPx = Math.min(vh - adjustedYPx, rawHPx + 24);

      const y = Number(((adjustedYPx / vh) * 100).toFixed(2));
      const height = Number(((adjustedHPx / vh) * 100).toFixed(2));

      return {
        x,
        y,
        width,
        height,
        statusMessage: `✨ Gemini AI đã nhận diện thành công: Y=${y}% (-12px top padding), Cao=${height}% (+24px height padding), Rộng=${width}%, X=${x}% (Đã kích hoạt mờ blur(16px))`
      };
    } catch (err: any) {
      console.warn('Lỗi gọi Gemini API, chuyển sang thuật toán dự phòng local:', err);
      const fallback = AITextDetectionEngine.detectChineseSubtitleBox(videoEl, previewCanvas);
      return {
        x: fallback.x,
        y: fallback.y,
        width: fallback.w,
        height: fallback.h,
        statusMessage: `🛡️ Dự phòng AI HPP: Y=${fallback.y}%, Cao=${fallback.h}% (Đã kích hoạt mờ blur(16px))`
      };
    }
  }

  /**
   * AI Text Detection Engine for Chinese Hardcoded Subtitles
   * Strictly enforces 4 immutable principles:
   * 1. Strict Bottom-Band Isolation (Y: 70% - 100%)
   * 2. Horizontal Projection Profile (HPP) Clustering & Noise Filter
   * 3. Precise Bottom-Anchored Box & Safety Clamp
   * 4. Responsive & Fullscreen Coordinate Synchronization
   */
  public static detectChineseSubtitleBox(
    videoEl: HTMLVideoElement,
    previewCanvas?: HTMLCanvasElement | null
  ): SubtitleDetectionResult {
    const vw = videoEl.videoWidth || 1280;
    const vh = videoEl.videoHeight || 720;

    // =========================================================================
    // PRINCIPLE 1: Strict Bottom-Band Isolation
    // Completely cut off top 75% of the video. Scan area strictly Y: 70% - 100%
    // =========================================================================
    const scanStartY = Math.floor(vh * 0.70); // Y start at 70%
    const scanEndY = vh;                     // Y end at 100%
    const scanHeight = scanEndY - scanStartY;

    // Fallback default box if context or video not ready
    const defaultBox: SubtitleDetectionResult = {
      x: 0,
      y: 80,
      w: 100,
      h: 12,
      yMinPx: vh * 0.80,
      yMaxPx: vh * 0.92,
      heightPx: vh * 0.12,
      isClamped: true,
      statusMessage: '✨ Ép cứng vùng che mờ an toàn vùng đáy (78%-85%, Cao 12%).'
    };

    if (scanHeight <= 0 || videoEl.readyState < 2) {
      return defaultBox;
    }

    // PERF: Reuse static offscreen canvas sized vw x scanHeight to avoid GPU texture creation | Fix: RC#1
    if (!AITextDetectionEngine.cachedCanvas) {
      AITextDetectionEngine.cachedCanvas = document.createElement('canvas');
      AITextDetectionEngine.cachedCtx = AITextDetectionEngine.cachedCanvas.getContext('2d', { willReadFrequently: true });
    }

    if (
      AITextDetectionEngine.cachedCanvas.width !== vw ||
      AITextDetectionEngine.cachedCanvas.height !== scanHeight
    ) {
      AITextDetectionEngine.cachedCanvas.width = vw;
      AITextDetectionEngine.cachedCanvas.height = scanHeight;
    }

    const ctx = AITextDetectionEngine.cachedCtx;
    if (!ctx) {
      return defaultBox;
    }

    // PERF: Draw only scan region (bottom 30%) instead of full frame to save 70% GPU write bandwidth | Fix: RC#2
    ctx.drawImage(
      videoEl,
      0, scanStartY, vw, scanHeight,  // source: bottom 30% scan region
      0, 0,          vw, scanHeight   // dest: small canvas
    );

    // PERF: Read pixel data for scan area from small canvas | Fix: RC#2 & RC#3
    let imgData: ImageData;
    try {
      imgData = ctx.getImageData(0, 0, vw, scanHeight);
    } catch (e) {
      console.warn('getImageData failed (tainted canvas):', e);
      return defaultBox;
    }
    const pixels = imgData.data;

    // =========================================================================
    // PRINCIPLE 2: Horizontal Projection Profile (HPP) Clustering
    // Scan horizontal rows in the 70%-100% bottom region for high-contrast text pixels
    // =========================================================================
    const hpp = new Float32Array(scanHeight); // Dense pixel profile for each row in crop region

    for (let r = 0; r < scanHeight; r++) {
      let rowEdgeCount = 0;
      const rowOffset = r * vw * 4;

      // Sample pixels across X axis (skipping by 2 for speed and high density measurement)
      for (let c = 2; c < vw - 2; c += 2) {
        const idx = rowOffset + c * 4;
        const pIdx = rowOffset + (c - 2) * 4;

        const lum = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
        const pLum = 0.299 * pixels[pIdx] + 0.587 * pixels[pIdx + 1] + 0.114 * pixels[pIdx + 2];

        // High contrast horizontal transition (subtitle text stroke border)
        const contrast = Math.abs(lum - pLum);
        
        // Subtitles usually have strong strokes (white text with dark border or high luminance)
        if (contrast > 32 || (lum > 210 && contrast > 18)) {
          rowEdgeCount++;
        }
      }

      hpp[r] = rowEdgeCount;
    }

    // Adaptive threshold for a valid text row (at least ~3.5% of row width has text stroke transitions)
    const minRowDensity = Math.max(12, vw * 0.035);

    // Identify active text rows and cluster them into blocks
    const activeRows: number[] = [];
    for (let r = 0; r < scanHeight; r++) {
      if (hpp[r] >= minRowDensity) {
        activeRows.push(r);
      }
    }

    // Group active rows into contiguous blocks (allowing tiny gaps of <= 4px for multi-stroke character gaps)
    const textBlocks: Array<{ startR: number; endR: number; totalDensity: number }> = [];
    if (activeRows.length > 0) {
      let currentStart = activeRows[0];
      let currentEnd = activeRows[0];
      let currentDensity = hpp[activeRows[0]];

      for (let i = 1; i < activeRows.length; i++) {
        const r = activeRows[i];
        if (r <= currentEnd + 4) { // Gap tolerance of 4 rows for characters
          currentEnd = r;
          currentDensity += hpp[r];
        } else {
          // Finish block if block height >= 5px (filter single noisy rows)
          if (currentEnd - currentStart >= 4) {
            textBlocks.push({ startR: currentStart, endR: currentEnd, totalDensity: currentDensity });
          }
          currentStart = r;
          currentEnd = r;
          currentDensity = hpp[r];
        }
      }

      if (currentEnd - currentStart >= 4) {
        textBlocks.push({ startR: currentStart, endR: currentEnd, totalDensity: currentDensity });
      }
    }

    // Filter noise: Keep blocks with height >= 6px and sufficient total density
    const validBlocks = textBlocks.filter(b => (b.endR - b.startR + 1) >= 6);

    let rawYMin = 0;
    let rawYMax = 0;
    let foundValidText = false;

    if (validBlocks.length > 0) {
      // Pick the primary subtitle block (highest density or lowest in bottom band)
      validBlocks.sort((a, b) => b.totalDensity - a.totalDensity);
      const mainBlock = validBlocks[0];

      // PERF: Map crop coordinate back to absolute video frame Y coordinate by adding scanStartY | Fix: RC#2
      rawYMin = scanStartY + mainBlock.startR;
      rawYMax = scanStartY + mainBlock.endR;
      foundValidText = true;
    }

    // =========================================================================
    // PRINCIPLE 3: Precise Bottom-Anchored Box & Safety Clamp
    // =========================================================================
    let calculatedYMin = rawYMin;
    let calculatedYMax = rawYMax;
    let calculatedHeight = rawYMax - rawYMin;

    const maxAllowedHeight = vh * 0.18; // Height > 18% of screen
    const minAllowedYMin = vh * 0.70;   // Y_Min above 70% of screen

    let isClamped = false;

    if (
      !foundValidText ||
      calculatedHeight > maxAllowedHeight ||
      calculatedHeight < (vh * 0.03) ||
      calculatedYMin < minAllowedYMin
    ) {
      // Force Hard Clamp: Height = 12%, Y_Min anchored tightly at bottom (80%)
      isClamped = true;
      calculatedHeight = vh * 0.12;
      calculatedYMin = vh * 0.80; // Ghim chặt ở vùng đáy (78% - 85%)
      calculatedYMax = calculatedYMin + calculatedHeight;
    } else {
      // Add a slight safety margin padding (4px top & bottom)
      calculatedYMin = Math.max(scanStartY, calculatedYMin - 4);
      calculatedYMax = Math.min(vh, calculatedYMax + 4);
      calculatedHeight = calculatedYMax - calculatedYMin;
    }

    // Calculate percentage values
    const yPercent = Number(((calculatedYMin / vh) * 100).toFixed(2));
    const hPercent = Number(((calculatedHeight / vh) * 100).toFixed(2));

    const statusMsg = isClamped
      ? `🛡️ Chốt chặn an toàn: Ép Height=12%, Ghim Y_Min ở ${yPercent}% (Vùng đáy 78-85%).`
      : `✨ AI HPP Detection: Y_Min=${yPercent}%, Height=${hPercent}%, X=0%, Width=100% (Khớp 100% vùng đáy).`;

    return {
      x: 0,
      y: yPercent,
      w: 100,
      h: hPercent,
      yMinPx: calculatedYMin,
      yMaxPx: calculatedYMax,
      heightPx: calculatedHeight,
      isClamped,
      statusMessage: statusMsg
    };
  }

  /**
   * PRINCIPLE 4: Synchronize coordinates for Responsive & Fullscreen
   * Calculates scaleX and scaleY from canvas bounding box
   */
  public static getCanvasScale(canvas: HTMLCanvasElement): { scaleX: number; scaleY: number } {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    return { scaleX, scaleY };
  }
}

/**
 * AI-Powered Subtitle OCR & Blur Boxing Engine v3.2
 */
export class AISubtitleDetector {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;

  constructor(canvasElement: HTMLCanvasElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  async detectSubtitleBox(): Promise<{ y: number; height: number; width: number; x: number }> {
    if (!this.ctx) {
      return { y: Math.floor(this.canvas.height * 0.85), height: Math.floor(this.canvas.height * 0.12), width: this.canvas.width, x: 0 };
    }

    const width = this.canvas.width;
    const height = this.canvas.height;

    const scanStartY = Math.floor(height * 0.80);
    const scanHeight = height - scanStartY;

    const imageData = this.ctx.getImageData(0, scanStartY, width, scanHeight);
    const data = imageData.data;

    const rowDensity = new Array(scanHeight).fill(0);
    
    for (let y = 0; y < scanHeight; y++) {
      let activePixels = 0;
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
        
        if (brightness > 190 || brightness < 35) {
          activePixels++;
        }
      }
      rowDensity[y] = activePixels;
    }

    let subStart = -1;
    let subEnd = -1;
    const threshold = width * 0.12;

    for (let y = 0; y < scanHeight; y++) {
      if (rowDensity[y] > threshold) {
        if (subStart === -1) subStart = y;
        subEnd = y;
      }
    }

    if (subStart === -1 || subEnd === -1 || (subEnd - subStart) < 4) {
      return {
        y: scanStartY + Math.floor(scanHeight * 0.35),
        height: Math.floor(scanHeight * 0.35),
        width: width,
        x: 0
      };
    }

    const padding = 6;
    const finalYMin = Math.max(scanStartY, scanStartY + subStart - padding);
    const finalYMax = Math.min(height, scanStartY + subEnd + padding);
    const finalHeight = finalYMax - finalYMin;

    return {
      y: finalYMin,
      height: finalHeight,
      width: width,
      x: 0
    };
  }

  renderFrame(currentSubtitleText: string | null, blurBoxState: { x: number; y: number; width: number; height: number } | null) {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (blurBoxState) {
      this.ctx.save();
      this.ctx.filter = 'blur(16px)';
      this.ctx.drawImage(
        this.canvas, 
        blurBoxState.x, blurBoxState.y, blurBoxState.width, blurBoxState.height,
        blurBoxState.x, blurBoxState.y, blurBoxState.width, blurBoxState.height
      );
      this.ctx.restore();
    }

    if (currentSubtitleText) {
      this.ctx.save();
      this.ctx.font = 'bold 42px Bangers, sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';

      const centerX = this.canvas.width / 2;
      const centerY = blurBoxState ? blurBoxState.y + (blurBoxState.height / 2) : this.canvas.height * 0.85;

      this.ctx.lineWidth = 6;
      this.ctx.strokeStyle = 'black';
      this.ctx.lineJoin = 'round';
      this.ctx.strokeText(currentSubtitleText, centerX, centerY);

      this.ctx.fillStyle = 'white';
      this.ctx.fillText(currentSubtitleText, centerX, centerY);

      this.ctx.restore();
    }
  }
}

if (typeof window !== 'undefined') {
  (window as any).AISubtitleDetector = AISubtitleDetector;
}

