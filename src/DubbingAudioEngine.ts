/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { fetchSegmentAudioBufferV2, VoiceConfig } from './VietnamVoiceOptimizationEngine';

// ============================================================
// HẰNG SỐ CẤU HÌNH PIPELINE LỒNG TIẾNG TỐI ƯU
// ============================================================
export const SRT_SLOWDOWN_FACTOR = 1.0;  // Giữ nguyên thời gian SRT (không kéo dài)
export const AUDIO_SPEEDUP_FACTOR = 1.2;   // Tăng tốc 1.2x giọng đọc tự nhiên
export const TTS_CONCURRENCY = 12;         // Tăng số request TTS chạy song song tối đa lên 12
export const TTS_MAX_RETRIES = 2;          // Retry tối đa 2 lần

export interface DubSubtitle {
  start: number;
  end: number;
  text: string;
}

export interface SyncCheckpoint {
  videoTime: number;  // Mốc thời gian gốc (khớp sub.start)
  audioTime: number;  // Vị trí thực tế tương ứng trong file audio cuối cùng
}

// SYNC-FIX: Export interface with tracked segment positions & checkpoints in final audio timeline
export interface DubResult {
  finalBuffer: AudioBuffer;
  videoPlaybackRate: number;
  finalAudioPositions: number[];
  syncCheckpoints: SyncCheckpoint[];
}

/**
 * Hàng đợi song song (Concurrency Pool) xử lý tối đa limit tasks cùng lúc.
 * Throttled callback tối đa 200ms/lần để giảm giật lag React setState.
 */
async function runWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onItemDone?: (completed: number, total: number) => void
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let completed = 0;
  let lastNotifyTime = 0;

  async function runOne(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
      completed++;
      const now = Date.now();
      if (onItemDone && (now - lastNotifyTime >= 200 || completed === items.length)) {
        lastNotifyTime = now;
        onItemDone(completed, items.length);
      }
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runOne()));
  return results;
}

/**
 * Xây dựng track lồng tiếng hoàn chỉnh V2:
 * 1) Tải song song (concurrency pool = 12) toàn bộ audio cho từng dòng SRT.
 * 2) Ghép nối tiếp theo đúng thứ tự, chèn khoảng lặng giữ nhịp theo mốc thời gian SRT_SLOWDOWN_FACTOR = 1.0.
 * 3) Render âm thanh với sampleRate = 48000Hz.
 * 4) Tính playbackRate cho video và tạo bảng syncCheckpoints để đồng bộ chính xác.
 */
export async function buildDubbedAudioTrackV2(
  subtitles: DubSubtitle[],
  originalVideoDuration: number,
  voiceProfile: VoiceConfig,                    
  audioCacheRef: React.MutableRefObject<Map<string, string>>,
  onProgress: (msg: string) => void,
  sessionId?: string
): Promise<DubResult> {
  const sampleRate = 48000;
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate });

  // Early return nếu không có subtitle nào
  if (!subtitles || subtitles.length === 0) {
    const emptyBuffer = audioCtx.createBuffer(1, sampleRate, sampleRate);
    await audioCtx.close().catch(() => {});
    return { finalBuffer: emptyBuffer, videoPlaybackRate: 1, finalAudioPositions: [], syncCheckpoints: [] };
  }

  // Bước 1: Tải song song từ CapCut TTS
  onProgress('0% Đang tổng hợp giọng CapCut AI...');
  const rawBuffers = await runWithConcurrencyLimit(
    subtitles,
    TTS_CONCURRENCY,
    (sub) =>
      fetchSegmentAudioBufferV2(
        sub.text,
        voiceProfile,
        audioCtx,
        audioCacheRef,
        sessionId
      ),
    (done, total) =>
      onProgress(
        `${Math.round((done / total) * 75)}% (${done}/${total}) Giọng đọc CapCut AI đang được tạo...`
      )
  );

  // Bước 2: Ghép nối tiếp theo đúng thứ tự timeline
  onProgress('80% Đang xếp timeline âm thanh...');
  const audioChunks: Float32Array[] = [];
  let timelineCursorSec = 0;

  // SYNC-FIX: Track actual audio start positions & rawCheckpoints before speedup
  const actualAudioPositions: number[] = [];
  const rawCheckpoints: Array<{ videoTime: number; preSpeedupAudioTime: number }> = [];

  subtitles.forEach((sub, i) => {
    const buf = rawBuffers[i];
    const slotStartSec = sub.start / SRT_SLOWDOWN_FACTOR;

    if (slotStartSec > timelineCursorSec) {
      const silenceLen = Math.round((slotStartSec - timelineCursorSec) * sampleRate);
      audioChunks.push(new Float32Array(silenceLen));
      timelineCursorSec = slotStartSec;
    }

    rawCheckpoints.push({ videoTime: sub.start, preSpeedupAudioTime: timelineCursorSec });
    actualAudioPositions.push(timelineCursorSec);

    if (buf) {
      audioChunks.push(buf.getChannelData(0).slice());
      timelineCursorSec += buf.duration;
    }
  });

  const totalSamples = Math.max(audioChunks.reduce((sum, c) => sum + c.length, 0), 1);
  const preSpeedupBuffer = audioCtx.createBuffer(1, totalSamples, sampleRate);
  const channelData = preSpeedupBuffer.getChannelData(0);
  let writeOffset = 0;
  for (const chunk of audioChunks) {
    channelData.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }

  // Bước 3: Render audio buffer hoàn chỉnh x1.8
  onProgress('95% Đang hoàn tất xử lý âm thanh...');
  let finalBuffer: AudioBuffer;

  if ((AUDIO_SPEEDUP_FACTOR as number) === 1.0) {
    finalBuffer = preSpeedupBuffer;
  } else {
    const finalDurationSec = preSpeedupBuffer.duration / AUDIO_SPEEDUP_FACTOR;
    const offlineCtx = new OfflineAudioContext(1, Math.ceil(finalDurationSec * sampleRate), sampleRate);
    const finalSource = offlineCtx.createBufferSource();
    finalSource.buffer = preSpeedupBuffer;
    finalSource.playbackRate.value = AUDIO_SPEEDUP_FACTOR;
    finalSource.connect(offlineCtx.destination);
    finalSource.start(0);
    finalBuffer = await offlineCtx.startRendering();
  }

  // SYNC-FIX: Map actual positions & rawCheckpoints to final timeline after speedup
  const finalAudioPositions: number[] = actualAudioPositions.map(
    pos => pos / AUDIO_SPEEDUP_FACTOR
  );

  const syncCheckpoints: SyncCheckpoint[] = rawCheckpoints.map(cp => ({
    videoTime: cp.videoTime,
    audioTime: cp.preSpeedupAudioTime / AUDIO_SPEEDUP_FACTOR,
  }));

  // Bước 4: Playback rate video
  const rawRatio = originalVideoDuration / finalBuffer.duration;
  const videoPlaybackRate = Math.min(1, Math.max(0.5, rawRatio));

  await audioCtx.close().catch(() => {});
  return { finalBuffer, videoPlaybackRate, finalAudioPositions, syncCheckpoints };
}

export const buildDubbedAudioTrack = buildDubbedAudioTrackV2;

/** Nội suy tuyến tính giữa 2 checkpoint gần nhất để quy đổi video time -> audio time */
export function videoTimeToAudioTime(
  videoTime: number,
  checkpoints: SyncCheckpoint[],
  fallbackRate: number
): number {
  if (!checkpoints || checkpoints.length === 0) return videoTime / (fallbackRate || 1);
  if (videoTime <= checkpoints[0].videoTime) return checkpoints[0].audioTime;
  const last = checkpoints[checkpoints.length - 1];
  if (videoTime >= last.videoTime) return last.audioTime;

  for (let i = 0; i < checkpoints.length - 1; i++) {
    const a = checkpoints[i], b = checkpoints[i + 1];
    if (videoTime >= a.videoTime && videoTime <= b.videoTime) {
      const t = (videoTime - a.videoTime) / (b.videoTime - a.videoTime || 1);
      return a.audioTime + t * (b.audioTime - a.audioTime);
    }
  }
  return videoTime / (fallbackRate || 1);
}

