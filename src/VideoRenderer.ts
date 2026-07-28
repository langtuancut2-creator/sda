import { getActiveSubtitle, getActiveSubtitleByAudioTime } from './SubtitleRenderer';
import { SyncCheckpoint, videoTimeToAudioTime } from './DubbingAudioEngine';

export interface GraphicsFrameParams {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  renderVideo: HTMLVideoElement;
  currentTime: number;
  videoWidth: number;
  videoHeight: number;
  zoomLevel: number;
  isMirrored: boolean;
  blurIntensity: number;
  blurBox: { x: number; y: number; w: number; h: number };
  showBgBar: boolean;
  logoImg: HTMLImageElement | ImageBitmap | null;
  logoX: number;
  logoY: number;
  logoScale: number;
  subtitles: Array<{ start: number; end: number; text: string }>;
  isTextAutoCentered: boolean;
  textX: number;
  textY: number;
  fontSize: number;
  strokeWidth: number;
  scaleFactor: number;
  syncCheckpoints?: SyncCheckpoint[];
  dubAudioPositions?: number[];
  videoPlaybackRate?: number;
  isDubbingActive?: boolean;
  audioCurrentTime?: number;
  activeSubtitleTextOverride?: string | null;
}

/**
 * ============================================================
 * FRAME CACHE SYSTEM - Avoid re-rendering identical frames
 * ============================================================
 */
class FrameRenderCache {
  private cache = new Map<string, CanvasImageSource>();
  private lastCacheKey: string | null = null;
  private maxCacheSize: number = 30; // Keep last 30 frames

  generateCacheKey(
    currentTime: number,
    zoomLevel: number,
    isMirrored: boolean,
    blurIntensity: number,
    subtitleText: string | null,
    logoX: number,
    logoY: number,
    logoScale: number,
    fontSize: number = 0,
    strokeWidth: number = 0,
    textX: number = 0,
    textY: number = 0,
    isTextAutoCentered: boolean = true,
    showBgBar: boolean = false,
    bx: number = 0,
    by: number = 0,
    bw: number = 0,
    bh: number = 0
  ): string {
    // Round time to nearest frame boundary (30fps = 33.33ms)
    const frameTime = Math.round(currentTime * 30) / 30;
    return `${frameTime}_${zoomLevel}_${isMirrored}_${blurIntensity}_${subtitleText}_${logoX}_${logoY}_${logoScale}_${fontSize}_${strokeWidth}_${textX}_${textY}_${isTextAutoCentered}_${showBgBar}_${bx}_${by}_${bw}_${bh}`;
  }

  get(key: string): CanvasImageSource | null {
    return this.cache.get(key) || null;
  }

  set(key: string, frame: CanvasImageSource): void {
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, frame);
  }

  clear(): void {
    this.cache.clear();
    this.lastCacheKey = null;
  }

  getLastKey(): string | null {
    return this.lastCacheKey;
  }

  setLastKey(key: string): void {
    this.lastCacheKey = key;
  }
}

const frameCache = new FrameRenderCache();

let offscreenBlurCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
let offscreenBlurCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

function getBlurBuffer(w: number, h: number) {
  if (!offscreenBlurCanvas) {
    if (typeof OffscreenCanvas !== 'undefined') {
      offscreenBlurCanvas = new OffscreenCanvas(w, h);
    } else {
      offscreenBlurCanvas = document.createElement('canvas');
      offscreenBlurCanvas.width = w;
      offscreenBlurCanvas.height = h;
    }
    offscreenBlurCtx = offscreenBlurCanvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  } else {
    if (offscreenBlurCanvas.width !== w || offscreenBlurCanvas.height !== h) {
      offscreenBlurCanvas.width = w;
      offscreenBlurCanvas.height = h;
    }
  }
  return { canvas: offscreenBlurCanvas, ctx: offscreenBlurCtx };
}

/**
 * ============================================================
 * OPTIMIZED BLUR USING CANVAS FILTER
 * ============================================================
 */
function applyOptimizedBlur(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  video: HTMLVideoElement,
  videoWidth: number,
  videoHeight: number,
  blurBox: { x: number; y: number; w: number; h: number },
  blurIntensity: number,
  scaleFactor: number,
  zoomLevel: number = 100,
  isMirrored: boolean = false,
  showBgBar: boolean = false
): void {
  if (blurIntensity <= 0 || blurBox.h <= 0 || video.readyState < 2) {
    return;
  }

  const bx = 0;
  const by = Math.max(0, Math.floor((blurBox.y / 100) * videoHeight));
  const bw = videoWidth;
  const bh = Math.min(videoHeight - by, Math.ceil((blurBox.h / 100) * videoHeight));

  if (bw <= 0 || bh <= 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(bx, by, bw, bh);
  ctx.clip();

  // Dark semi-transparent overlay
  const bgOpacity = showBgBar ? 0.85 : 0.45;
  ctx.fillStyle = `rgba(0, 0, 0, ${bgOpacity})`;
  ctx.fillRect(bx, by, bw, bh);

  // High performance downscaled blur buffer (4x downscale)
  const scale = 0.25;
  const smallW = Math.max(1, Math.floor(videoWidth * scale));
  const smallH = Math.max(1, Math.floor(videoHeight * scale));

  const { canvas: bCanvas, ctx: bCtx } = getBlurBuffer(smallW, smallH);
  if (bCtx) {
    bCtx.imageSmoothingEnabled = true;
    bCtx.imageSmoothingQuality = 'low';

    const zoomFactor = zoomLevel / 100;
    const mirrorFactor = isMirrored ? -1 : 1;

    bCtx.save();
    if (zoomLevel === 100 && !isMirrored) {
      bCtx.drawImage(video, 0, 0, smallW, smallH);
    } else {
      bCtx.translate(smallW / 2, smallH / 2);
      bCtx.scale(zoomFactor * mirrorFactor, zoomFactor);
      bCtx.drawImage(video, -smallW / 2, -smallH / 2, smallW, smallH);
    }
    bCtx.restore();

    const smallBlurPx = Math.max(1, Math.round(blurIntensity * scaleFactor * scale * 1.0));

    ctx.save();
    ctx.filter = `blur(${Math.min(smallBlurPx, 16)}px)`;
    ctx.drawImage(bCanvas as CanvasImageSource, 0, 0, smallW, smallH, 0, 0, videoWidth, videoHeight);
    ctx.restore();
  }

  ctx.restore();
}

/**
 * ============================================================
 * OPTIMIZED TEXT RENDERING - Cache font metrics
 * ============================================================
 */
class TextRenderCache {
  private fontMetrics = new Map<string, TextMetrics>();
  private lastFontSize: number | null = null;

  getMeasuredText(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    text: string,
    fontSize: number
  ): TextMetrics {
    const font = `bold ${fontSize}px "Bangers", cursive, sans-serif`;
    const key = `${text}_${fontSize}`;

    ctx.font = font;

    if (this.lastFontSize === fontSize && this.fontMetrics.has(key)) {
      return this.fontMetrics.get(key)!;
    }

    const metrics = ctx.measureText(text);
    this.fontMetrics.set(key, metrics);
    this.lastFontSize = fontSize;

    if (this.fontMetrics.size > 50) {
      const firstKey = this.fontMetrics.keys().next().value;
      if (firstKey) this.fontMetrics.delete(firstKey);
    }

    return metrics;
  }

  clear(): void {
    this.fontMetrics.clear();
    this.lastFontSize = null;
  }
}

const textCache = new TextRenderCache();

/**
 * ============================================================
 * OPTIMIZED VIDEO FRAME RENDERING
 * ============================================================
 */
export function drawGraphicsFrame(params: GraphicsFrameParams): void {
  const {
    ctx,
    renderVideo,
    currentTime,
    videoWidth,
    videoHeight,
    zoomLevel,
    isMirrored,
    blurIntensity,
    blurBox,
    showBgBar,
    logoImg,
    logoX,
    logoY,
    logoScale,
    subtitles,
    isTextAutoCentered,
    textX,
    textY,
    fontSize,
    strokeWidth,
    scaleFactor,
    syncCheckpoints,
    dubAudioPositions,
    videoPlaybackRate,
    isDubbingActive,
    audioCurrentTime,
    activeSubtitleTextOverride
  } = params;

  // Determine active subtitle text
  let activeSubtitleText: string | null = null;
  if (activeSubtitleTextOverride !== undefined) {
    activeSubtitleText = activeSubtitleTextOverride;
  } else if (
    isDubbingActive &&
    dubAudioPositions &&
    dubAudioPositions.length === subtitles.length &&
    audioCurrentTime !== undefined
  ) {
    activeSubtitleText = getActiveSubtitleByAudioTime(subtitles, dubAudioPositions, audioCurrentTime);
  } else if (syncCheckpoints && syncCheckpoints.length > 0) {
    const audioTime = videoTimeToAudioTime(currentTime, syncCheckpoints, videoPlaybackRate || 1);
    const audioPositions =
      dubAudioPositions && dubAudioPositions.length === subtitles.length
        ? dubAudioPositions
        : syncCheckpoints.map((c) => c.audioTime);
    activeSubtitleText = getActiveSubtitleByAudioTime(subtitles, audioPositions, audioTime);
  } else {
    activeSubtitleText = getActiveSubtitle(subtitles, currentTime);
  }

  // Frame caching - Only skip if video is paused and parameters haven't changed
  const isPaused = renderVideo.paused || renderVideo.ended;
  const cacheKey = frameCache.generateCacheKey(
    currentTime,
    zoomLevel,
    isMirrored,
    blurIntensity,
    activeSubtitleText,
    logoX,
    logoY,
    logoScale,
    fontSize,
    strokeWidth,
    textX,
    textY,
    isTextAutoCentered,
    showBgBar,
    blurBox.x,
    blurBox.y,
    blurBox.w,
    blurBox.h
  );

  if (isPaused && frameCache.getLastKey() === cacheKey) {
    return;
  }

  frameCache.setLastKey(cacheKey);

  // Clear canvas
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, videoWidth, videoHeight);

  // A. DRAW BASE VIDEO (WITH ZOOM & MIRROR)
  if (renderVideo.readyState >= 2) {
    if (zoomLevel === 100 && !isMirrored) {
      ctx.drawImage(renderVideo, 0, 0, videoWidth, videoHeight);
    } else {
      const zoomFactor = zoomLevel / 100;
      const mirrorFactor = isMirrored ? -1 : 1;

      ctx.save();
      ctx.translate(videoWidth / 2, videoHeight / 2);
      ctx.scale(zoomFactor * mirrorFactor, zoomFactor);
      ctx.drawImage(renderVideo, -videoWidth / 2, -videoHeight / 2, videoWidth, videoHeight);
      ctx.restore();
    }
  }

  // B. DRAW BLUR BOX
  applyOptimizedBlur(ctx, renderVideo, videoWidth, videoHeight, blurBox, blurIntensity, scaleFactor, zoomLevel, isMirrored, showBgBar);

  // C. DRAW LOGO OVERLAY
  if (logoImg) {
    const lx = (logoX / 100) * videoWidth;
    const ly = (logoY / 100) * videoHeight;
    const lw = (logoScale / 100) * videoWidth;
    const naturalWidth = 'naturalWidth' in logoImg ? logoImg.naturalWidth : logoImg.width;
    const naturalHeight = 'naturalHeight' in logoImg ? logoImg.naturalHeight : logoImg.height;
    const lh = ((naturalHeight || 1) / (naturalWidth || 1)) * lw;

    if (lx + lw / 2 > 0 && lx - lw / 2 < videoWidth && ly + lh / 2 > 0 && ly - lh / 2 < videoHeight) {
      ctx.drawImage(logoImg as CanvasImageSource, lx - lw / 2, ly - lh / 2, lw, lh);
    }
  }

  // D. DRAW SUBTITLES
  if (activeSubtitleText) {
    drawOptimizedSubtitle(
      ctx,
      activeSubtitleText,
      videoWidth,
      videoHeight,
      blurBox,
      isTextAutoCentered,
      textX,
      textY,
      fontSize,
      strokeWidth,
      showBgBar
    );
  }
}

/**
 * ============================================================
 * OPTIMIZED SUBTITLE DRAWING
 * ============================================================
 */
function drawOptimizedSubtitle(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  textStr: string,
  videoWidth: number,
  videoHeight: number,
  blurBox: { x: number; y: number; w: number; h: number },
  isTextAutoCentered: boolean,
  textX: number,
  textY: number,
  fontSize: number,
  strokeWidth: number,
  showBgBar: boolean
): void {
  const cleanText = textStr.replace(/\n/g, ' ');
  const renderBlurY = (blurBox.y / 100) * videoHeight;
  const renderBlurH = (blurBox.h / 100) * videoHeight;

  let tx: number, ty: number;
  if (isTextAutoCentered) {
    tx = videoWidth / 2;
    ty = renderBlurY + renderBlurH / 2;
  } else {
    tx = (textX / 100) * videoWidth;
    ty = (textY / 100) * videoHeight;
  }

  const fontSizePercent = (fontSize / 720) * 100;
  let canvasFontSize = (fontSizePercent / 100) * videoHeight;

  const strokeWidthPercent = (strokeWidth / 720) * 100;
  const canvasStrokeWidth = (strokeWidthPercent / 100) * videoHeight * 0.12 * (fontSize / 24);

  ctx.save();

  const metrics = textCache.getMeasuredText(ctx, cleanText, canvasFontSize);
  let actualTextWidth = metrics.width;

  if (isTextAutoCentered) {
    const maxAllowedWidth = videoWidth * 0.9;
    if (actualTextWidth > maxAllowedWidth) {
      const sf = maxAllowedWidth / actualTextWidth;
      canvasFontSize = Math.floor(canvasFontSize * sf);
      ctx.font = `bold ${canvasFontSize}px "Bangers", cursive, sans-serif`;
      actualTextWidth = ctx.measureText(cleanText).width;
    }
  }

  if (showBgBar) {
    const paddingX = (18 / 720) * videoHeight;
    const paddingY = (4 / 720) * videoHeight;
    const barWidth = actualTextWidth + paddingX * 2;
    const barHeight = canvasFontSize + paddingY * 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(tx - barWidth / 2, ty - barHeight / 2, barWidth, barHeight);
  }

  ctx.font = `bold ${canvasFontSize}px "Bangers", cursive, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, canvasStrokeWidth);
  if ('letterSpacing' in ctx) {
    (ctx as unknown as { letterSpacing: string }).letterSpacing = '1px';
  }
  ctx.strokeStyle = '#000000';
  ctx.fillStyle = '#FFFFFF';

  ctx.strokeText(cleanText, tx, ty);
  ctx.fillText(cleanText, tx, ty);

  ctx.restore();
}

/**
 * ============================================================
 * THROTTLED RENDERING LOOP
 * ============================================================
 */
export function createThrottledRenderLoop(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  renderFn: () => void,
  targetFps: number = 30
): () => void {
  let lastRenderTime = 0;
  const frameInterval = 1000 / targetFps;
  let animationFrameId: number;

  const loop = () => {
    const now = performance.now();
    const timeSinceLastRender = now - lastRenderTime;

    if (timeSinceLastRender >= frameInterval) {
      renderFn();
      lastRenderTime = now;
    }

    animationFrameId = requestAnimationFrame(loop);
  };

  animationFrameId = requestAnimationFrame(loop);

  return () => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
  };
}

/**
 * ============================================================
 * UTILITY: CLEAR CACHES
 * ============================================================
 */
export function clearRenderCaches(): void {
  frameCache.clear();
  textCache.clear();
}

export const drawVideoFrame = drawGraphicsFrame;

