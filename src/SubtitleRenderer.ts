/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SubtitleItem {
  start: number;
  end: number;
  text: string;
}

export interface BlurBoxState {
  xPercent?: number;
  yPercent: number;
  wPercent?: number;
  hPercent: number;
}

/**
 * 1. Module Đồng bộ SRT (SRT Time Synchronization)
 * Tìm kiếm dòng text phụ đề đang active dựa trên video.currentTime (Binary search O(log N))
 * @param subtitles Danh sách các đoạn phụ đề
 * @param currentTime Thời gian hiện tại của video (tính bằng giây)
 * @returns Dòng phụ đề active hoặc null
 */
// SYNC-FIX + PERF: RC#5 — Binary search for video-based subtitle lookup O(log N)
export function getActiveSubtitle(subtitles: SubtitleItem[], currentTime: number): string | null {
  if (!subtitles || subtitles.length === 0) return null;
  let lo = 0, hi = subtitles.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (subtitles[mid].end < currentTime) {
      lo = mid + 1;
    } else if (subtitles[mid].start > currentTime) {
      hi = mid - 1;
    } else {
      return subtitles[mid].text;
    }
  }
  return null;
}

/**
 * Tìm kiếm dòng text phụ đề đang active dựa trên thời gian thực tế của audio lồng tiếng (Audio-driven lookup)
 * @param subtitles Danh sách các đoạn phụ đề
 * @param finalAudioPositions Mảng mốc thời điểm bắt đầu thực tế trong audio track của từng đoạn phụ đề
 * @param audioCurrentTime Thời gian hiện tại của audio lồng tiếng (tính bằng giây)
 * @returns Dòng phụ đề active hoặc null
 */
// SYNC-FIX: RC#2 — Active subtitle lookup based on actual audio playback position
export function getActiveSubtitleByAudioTime(
  subtitles: SubtitleItem[],
  finalAudioPositions: number[],
  audioCurrentTime: number
): string | null {
  if (!subtitles || subtitles.length === 0 || !finalAudioPositions || finalAudioPositions.length === 0) {
    return null;
  }
  let lo = 0, hi = finalAudioPositions.length - 1, result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (finalAudioPositions[mid] <= audioCurrentTime) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (result === -1) return null;
  return subtitles[result]?.text ?? null;
}

/**
 * 2 & 3. Module Thuật toán Căn giữa Động & Render Text Styling theo Responsive Percentage Engine
 * Render phụ đề trực tiếp lên HTMLCanvasElement với hiệu ứng viền đen chữ trắng CapCut.
 * 
 * @param ctx CanvasRenderingContext2D Context vẽ 2D
 * @param currentText Dòng text phụ đề đang active
 * @param blurBoxState Thông số phần trăm khối mờ (yPercent, hPercent, xPercent, wPercent)
 * @param canvas HTMLCanvasElement Canvas tham chiếu
 * @param fontSizePercent Cỡ chữ tính theo % chiều cao canvas (Mặc định 3.33% ~24px ở 720p)
 */
export function renderSubtitleOverlay(
  ctx: CanvasRenderingContext2D,
  currentText: string | null,
  blurBoxState: BlurBoxState | null,
  canvas: HTMLCanvasElement,
  fontSizePercent: number = 3.33
) { // [FIXED] JSDoc annotated
  if (!currentText || !blurBoxState) return;

  const text = currentText.trim();
  if (!text) return;

  const vw = canvas.width;
  const vh = canvas.height;

  // --- Dynamic Pixel Mapping từ % sang px ---
  const isFullWidth = blurBoxState.wPercent === undefined || blurBoxState.wPercent >= 98;
  const renderX = isFullWidth ? 0 : ((blurBoxState.xPercent ?? 0) / 100) * vw;
  const renderY = (blurBoxState.yPercent / 100) * vh;
  const renderWidth = isFullWidth ? vw : (blurBoxState.wPercent / 100) * vw;
  const renderHeight = (blurBoxState.hPercent / 100) * vh;

  // Trọng tâm khối mờ (Center Y)
  const centerY = renderY + (renderHeight / 2);
  const centerX = isFullWidth ? (vw / 2) : (renderX + renderWidth / 2);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Cỡ chữ quy đổi từ % sang px thực tế theo canvas.height
  let renderFontSize = Math.floor((fontSizePercent / 100) * vh);
  if (renderFontSize < 16) renderFontSize = 16;

  let fontString = `bold ${renderFontSize}px Bangers, sans-serif`;
  ctx.font = fontString;

  // Thu nhỏ font nếu chiều dài text vượt quá 90% chiều rộng khối mờ/màn hình
  const maxAllowedWidth = renderWidth > 0 ? renderWidth * 0.9 : vw * 0.9;
  let textMetrics = ctx.measureText(text);
  
  if (textMetrics.width > maxAllowedWidth) {
    const scaleFactor = maxAllowedWidth / textMetrics.width;
    renderFontSize = Math.floor(renderFontSize * scaleFactor);
    fontString = `bold ${renderFontSize}px Bangers, sans-serif`;
    ctx.font = fontString;
  }

  // Viền chữ và ruột chữ CapCut
  ctx.lineWidth = Math.max(3, Math.floor(renderFontSize * 0.15));
  ctx.strokeStyle = 'black';
  ctx.lineJoin = 'round';
  ctx.strokeText(text, centerX, centerY);

  ctx.fillStyle = 'white';
  ctx.fillText(text, centerX, centerY);
}

