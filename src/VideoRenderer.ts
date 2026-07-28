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
 * Render frame graphics layers (Video zoom/mirror, blur box, logo, subtitles)
 * Used for Live Preview Canvas
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

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, videoWidth, videoHeight);

  // A. Base Video (Zoom & Mirror)
  const zoomFactor = zoomLevel / 100;
  const mirrorFactor = isMirrored ? -1 : 1;

  if (renderVideo.readyState >= 2) {
    if (zoomLevel === 100 && !isMirrored) {
      ctx.drawImage(renderVideo, 0, 0, videoWidth, videoHeight);
    } else {
      ctx.save();
      ctx.translate(videoWidth / 2, videoHeight / 2);
      ctx.scale(zoomFactor * mirrorFactor, zoomFactor);
      ctx.drawImage(renderVideo, -videoWidth / 2, -videoHeight / 2, videoWidth, videoHeight);
      ctx.restore();
    }
  }

  // B. Blur Box
  if (blurIntensity > 0 && blurBox.h > 0) {
    const bx = 0;
    const by = Math.max(0, Math.floor((blurBox.y / 100) * videoHeight));
    const bw = videoWidth;
    const bh = Math.min(videoHeight - by, Math.ceil((blurBox.h / 100) * videoHeight));

    if (bw > 0 && bh > 0) {
      const blurPx = Math.max(1, Math.round(blurIntensity * scaleFactor));
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx, by, bw, bh);
      ctx.clip();

      const bgOpacity = showBgBar ? 0.85 : 0.45;
      ctx.fillStyle = `rgba(0, 0, 0, ${bgOpacity})`;
      ctx.fillRect(bx, by, bw, bh);

      if (renderVideo.readyState >= 2) {
        ctx.filter = `blur(${blurPx}px)`;
        const pad = Math.max(12, blurPx * 2);
        const cropY = Math.max(0, by - pad);
        const cropH = Math.min(videoHeight - cropY, bh + pad * 2);

        if (zoomLevel === 100 && !isMirrored) {
          ctx.drawImage(
            renderVideo,
            0, cropY, videoWidth, cropH,
            0, cropY, videoWidth, cropH
          );
        } else {
          ctx.save();
          ctx.translate(videoWidth / 2, videoHeight / 2);
          ctx.scale(zoomFactor * mirrorFactor, zoomFactor);
          ctx.drawImage(renderVideo, -videoWidth / 2, -videoHeight / 2, videoWidth, videoHeight);
          ctx.restore();
        }
      }

      ctx.restore();
    }
  }

  // C. Logo Overlay
  if (logoImg) {
    const lx = (logoX / 100) * videoWidth;
    const ly = (logoY / 100) * videoHeight;
    const lw = (logoScale / 100) * videoWidth;
    const naturalWidth = 'naturalWidth' in logoImg ? logoImg.naturalWidth : logoImg.width;
    const naturalHeight = 'naturalHeight' in logoImg ? logoImg.naturalHeight : logoImg.height;
    const lh = (naturalHeight / (naturalWidth || 1)) * lw;

    ctx.drawImage(logoImg as CanvasImageSource, lx - lw / 2, ly - lh / 2, lw, lh);
  }

  // D. Subtitle Resolution
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
  } else if (
    syncCheckpoints &&
    syncCheckpoints.length > 0
  ) {
    const audioTime = videoTimeToAudioTime(currentTime, syncCheckpoints, videoPlaybackRate || 1);
    const audioPositions = (dubAudioPositions && dubAudioPositions.length === subtitles.length)
      ? dubAudioPositions
      : syncCheckpoints.map(c => c.audioTime);
    activeSubtitleText = getActiveSubtitleByAudioTime(subtitles, audioPositions, audioTime);
  } else {
    activeSubtitleText = getActiveSubtitle(subtitles, currentTime);
  }

  if (activeSubtitleText) {
    const textStr = activeSubtitleText.replace(/\n/g, ' ');
    const renderBlurY = (blurBox.y / 100) * videoHeight;
    const renderBlurH = (blurBox.h / 100) * videoHeight;

    let tx: number, ty: number;
    if (isTextAutoCentered) {
      tx = videoWidth / 2;
      ty = renderBlurY + (renderBlurH / 2);
    } else {
      tx = (textX / 100) * videoWidth;
      ty = (textY / 100) * videoHeight;
    }

    const fontSizePercent = (fontSize / 720) * 100;
    let canvasFontSize = (fontSizePercent / 100) * videoHeight;

    const strokeWidthPercent = (strokeWidth / 720) * 100;
    const canvasStrokeWidth = (strokeWidthPercent / 100) * videoHeight * 0.12 * (fontSize / 24);

    ctx.save();
    ctx.font = `bold ${canvasFontSize}px "Bangers", cursive, sans-serif`;

    let actualTextWidth = ctx.measureText(textStr).width;

    if (isTextAutoCentered) {
      const maxAllowedWidth = videoWidth * 0.9;
      if (actualTextWidth > maxAllowedWidth) {
        const sf = maxAllowedWidth / actualTextWidth;
        canvasFontSize = Math.floor(canvasFontSize * sf);
        ctx.font = `bold ${canvasFontSize}px "Bangers", cursive, sans-serif`;
        actualTextWidth = ctx.measureText(textStr).width;
      }
    }

    if (showBgBar) {
      const paddingX = (18 / 720) * videoHeight;
      const paddingY = (4 / 720) * videoHeight;
      const barWidth = actualTextWidth + paddingX * 2;
      const barHeight = canvasFontSize + paddingY * 2;

      const gradient = ctx.createLinearGradient(tx - barWidth/2, ty, tx + barWidth/2, ty);
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(0.12, 'rgba(0,0,0,0.65)');
      gradient.addColorStop(0.88, 'rgba(0,0,0,0.65)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = gradient;
      ctx.fillRect(tx - barWidth/2, ty - barHeight/2, barWidth, barHeight);
    }

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

    ctx.strokeText(textStr, tx, ty);
    ctx.fillText(textStr, tx, ty);
    ctx.restore();
  }
}

export const drawVideoFrame = drawGraphicsFrame;
