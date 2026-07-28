/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * // [FIXED] Updated header and cleaned engine
 * Vietnam Voice Optimization Engine
 * Tối ưu giọng lồng tiếng CapCut "Cô gái hoạt ngôn" (BV074_streaming)
 */

import type React from 'react';

// ============================================================
// CẤU HÌNH VOICE VN CHUẨN
// ============================================================
export interface VoiceConfig {
  name: string;
  languageCode: string;
  ssmlGender: 'MALE' | 'FEMALE' | 'NEUTRAL';
  audioEncoding: 'MP3' | 'LINEAR16' | 'OGG_OPUS';
  pitch: number;           // -20.0 đến 20.0, đơn vị semi-tone
  speakingRate: number;    // 0.25 đến 4.0, mặc định 1.0
  volumeGainDb: number;    // -96.0 đến 16.0 dB
  sessionId?: string;
}

// ============================================================
// VOICE PROFILES: CÔ GÁI HOẠT NGÔN CAPCUT CHUẨN (BV074_streaming)
// ============================================================
export const VIETNAM_VOICE_PROFILES: Record<string, VoiceConfig> = {
  vn_female_neutral: {
    name: 'BV074_streaming',        // Mã CapCut chính xác giọng Cô gái hoạt ngôn
    languageCode: 'vi-VN',
    ssmlGender: 'FEMALE',
    audioEncoding: 'MP3',
    pitch: 0,
    speakingRate: 1.0,
    volumeGainDb: 0,
    sessionId: '3805a2f884764f5cd3d5393136d15802'
  },
  vn_female_bright: {
    name: 'BV074_streaming',
    languageCode: 'vi-VN',
    ssmlGender: 'FEMALE',
    audioEncoding: 'MP3',
    pitch: 0,
    speakingRate: 1.0,
    volumeGainDb: 0,
    sessionId: '3805a2f884764f5cd3d5393136d15802'
  },
  vn_female_professional: {
    name: 'BV074_streaming',
    languageCode: 'vi-VN',
    ssmlGender: 'FEMALE',
    audioEncoding: 'MP3',
    pitch: 0,
    speakingRate: 1.0,
    volumeGainDb: 0,
    sessionId: '3805a2f884764f5cd3d5393136d15802'
  }
};

// ============================================================
// TTS ENGINE: CapCut Voice Synthesis (BV074_streaming)
// ============================================================
export async function generateVoiceWithGoogle(
  text: string,
  voiceProfile: VoiceConfig,
  sessionId?: string
): Promise<{ audioBase64: string; duration: number }> {
  // [FIXED] Loại bỏ _apiKey parameter dư thừa không dùng
  const activeSessionId = sessionId || voiceProfile.sessionId || '3805a2f884764f5cd3d5393136d15802';

  const response = await fetch('/api/tts/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voice: 'BV074_streaming',
      sessionId: activeSessionId
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `TTS synthesis failed for text: "${text.slice(0, 30)}..."`);
  }

  const data = await response.json();
  if (!data || !data.audioBase64) {
    throw new Error(`Missing audio content for text: "${text.slice(0, 30)}..."`);
  }

  return {
    audioBase64: data.audioBase64,
    duration: data.duration || 0
  };
}

// ============================================================
// INTEGRATION: Tải audio buffer cho từng phân đoạn
// ============================================================
export async function fetchSegmentAudioBufferV2(
  text: string,
  voiceProfile: VoiceConfig,
  audioCtx: AudioContext,
  audioCacheRef: React.MutableRefObject<Map<string, string>>,
  sessionId?: string
): Promise<AudioBuffer | null> {
  // [FIXED] Loại bỏ googleTtsApiKey khỏi parameter
  const voiceCode = 'BV074_streaming';
  const cacheKey = `${voiceCode}:${text.trim().toLowerCase()}`;

  try {
    if (audioCacheRef.current.has(cacheKey)) {
      const cachedUrl = audioCacheRef.current.get(cacheKey)!;
      const res = await fetch(cachedUrl);
      const arrayBuffer = await res.arrayBuffer();
      return await audioCtx.decodeAudioData(arrayBuffer);
    }

    const { audioBase64 } = await generateVoiceWithGoogle(
      text,
      voiceProfile,
      sessionId
    );

    const binaryString = atob(audioBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'audio/mpeg' });
    const blobUrl = URL.createObjectURL(blob);

    audioCacheRef.current.set(cacheKey, blobUrl);

    const arrayBuffer = await blob.arrayBuffer();
    return await audioCtx.decodeAudioData(arrayBuffer);
  } catch (error) {
    console.error(`Failed to generate voice for: "${text.slice(0, 30)}..."`, error);
    return null;
  }
}


