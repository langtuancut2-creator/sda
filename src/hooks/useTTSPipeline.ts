import { useState, useEffect, useCallback } from 'react';
import type { SubtitleItem } from '../types';
import { VIETNAM_VOICE_PROFILES, type VoiceConfig } from '../VietnamVoiceOptimizationEngine';
import { buildDubbedAudioTrackV2, type SyncCheckpoint } from '../DubbingAudioEngine';
import { useCache } from '../contexts/CacheContext';

const DEFAULT_SAMPLE_SUBS: SubtitleItem[] = [
  { start: 1.2, end: 4.5, text: "Xin chào các bạn, chúc mọi người ngày mới tốt lành!" },
  { start: 5.0, end: 9.2, text: "Hôm nay chúng ta cùng trải nghiệm Lồng tiếng AI bằng giọng Cô gái hoạt ngôn CapCut." },
  { start: 10.0, end: 14.5, text: "Hệ thống tự động căn chỉnh âm thanh khớp thời gian phụ đề SRT sắc nét." }
];

export const timeToSeconds = (timeString: string) => {
  if (!timeString) return 0;
  const parts = timeString.trim().replace(',', '.').split(':');
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]) || 0;
    const minutes = parseFloat(parts[1]) || 0;
    const seconds = parseFloat(parts[2]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  } else if (parts.length === 2) {
    const minutes = parseFloat(parts[0]) || 0;
    const seconds = parseFloat(parts[1]) || 0;
    return minutes * 60 + seconds;
  }
  return parseFloat(timeString) || 0;
};

export const parseSRT = (srtText: string): SubtitleItem[] => {
  const srtArray: SubtitleItem[] = [];
  if (!srtText) return srtArray;

  const blocks = srtText.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\s*\n/);
  const timeRegex = /((\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3})\s*-->\s*((\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3})/;

  blocks.forEach(block => {
    const lines = block.split('\n');
    let timeLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (timeRegex.test(lines[i])) {
        timeLineIdx = i;
        break;
      }
    }
    if (timeLineIdx !== -1) {
      const match = lines[timeLineIdx].match(timeRegex);
      if (match) {
        const start = timeToSeconds(match[1]);
        const end = timeToSeconds(match[3]);
        const text = lines.slice(timeLineIdx + 1).join('\n').trim();
        if (!isNaN(start) && !isNaN(end) && text.length > 0) {
          srtArray.push({ start, end, text });
        }
      }
    }
  });

  srtArray.sort((a, b) => a.start - b.start);
  return srtArray;
};

export const formatMsToTimestamp = (ms: number) => {
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const millis = Math.floor(ms % 1000);

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(n).padStart(3, '0');
  return `${pad2(hrs)}:${pad2(mins)}:${pad2(secs)},${pad3(millis)}`;
};

export const useTTSPipeline = (
  subtitleFile: File | null,
  videoFile: File | null,
  videoDuration: number,
  setVideoPlaybackRate: (rate: number) => void
) => {
  const { audioCacheRef } = useCache();
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [currentSubtitle, setCurrentSubtitle] = useState('');
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [dubAudioPositions, setDubAudioPositions] = useState<number[]>([]);
  const [syncCheckpoints, setSyncCheckpoints] = useState<SyncCheckpoint[]>([]);
  const [voiceProfile, setVoiceProfile] = useState<VoiceConfig>(VIETNAM_VOICE_PROFILES.vn_female_neutral);
  const [isAiVoiceActive, setIsAiVoiceActive] = useState(true);
  const [sessionId, setSessionId] = useState('3805a2f884764f5cd3d5393136d15802');
  const [loadingSegmentIndex, setLoadingSegmentIndex] = useState<number | null>(null);
  const [isGeneratingAudioTimeline, setIsGeneratingAudioTimeline] = useState(false);
  const [audioTimelineProgress, setAudioTimelineProgress] = useState('');

  useEffect(() => {
    if (!isAiVoiceActive) {
      setDubAudioPositions([]);
      setSyncCheckpoints([]);
    }
  }, [isAiVoiceActive]);

  useEffect(() => {
    setDubAudioPositions([]);
    setSyncCheckpoints([]);
  }, [videoFile, subtitleFile]);

  useEffect(() => {
    if (subtitleFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const parsed = parseSRT(text);
        setSubtitles(parsed);
      };
      reader.readAsText(subtitleFile);
    } else {
      setSubtitles([]);
    }
  }, [subtitleFile]);

  const handlePreviewSegment = useCallback(async (text: string, index: number) => {
    setLoadingSegmentIndex(index);
    let played = false;

    const cacheKey = `google_tts:${voiceProfile.name}:${text.trim()}`;
    if (audioCacheRef.current.has(cacheKey)) {
      const cachedUrl = audioCacheRef.current.get(cacheKey)!;
      try {
        const audioPlayer = new Audio(cachedUrl);
        audioPlayer.onended = () => setLoadingSegmentIndex(null);
        audioPlayer.onerror = () => setLoadingSegmentIndex(null);
        await audioPlayer.play();
        return;
      } catch (err) {
        // Fallback
      }
    }

    try {
      const response = await fetch('/api/tts/google/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceProfile })
      });

      const data = await response.json();
      if (data && data.audioBase64) {
        try {
          const binaryStr = atob(data.audioBase64);
          const len = binaryStr.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: 'audio/mp3' });
          const audioUrl = URL.createObjectURL(blob);
          audioCacheRef.current.set(cacheKey, audioUrl);

          const audioPlayer = new Audio(audioUrl);
          audioPlayer.onended = () => setLoadingSegmentIndex(null);
          audioPlayer.onerror = () => setLoadingSegmentIndex(null);
          await audioPlayer.play();
          played = true;
        } catch (playErr) {
          console.warn("Audio element playback failed:", playErr);
        }
      }
    } catch (error) {
      console.error("Lỗi kết nối TTS endpoint:", error);
    }

    if (!played && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'vi-VN';
        utterance.rate = 1.0;
        utterance.onend = () => setLoadingSegmentIndex(null);
        utterance.onerror = () => setLoadingSegmentIndex(null);
        window.speechSynthesis.speak(utterance);
      } catch (synthErr) {
        setLoadingSegmentIndex(null);
      }
    } else if (!played) {
      setLoadingSegmentIndex(null);
    }
  }, [voiceProfile, audioCacheRef]);

  const audioBufferToWav = async (buffer: AudioBuffer): Promise<Blob> => {
    return new Promise((resolve) => {
      const numOfChan = buffer.numberOfChannels;
      const length = buffer.length * numOfChan * 2 + 44;
      const bufferArr = new ArrayBuffer(length);
      const out = new DataView(bufferArr);
      let channels: Float32Array[] = [];
      let sampleRate = buffer.sampleRate;
      let offset = 0;
      let pos = 0;

      function setUint16(data: number) { out.setUint16(pos, data, true); pos += 2; }
      function setUint32(data: number) { out.setUint32(pos, data, true); pos += 4; }

      setUint32(0x46464952); // "RIFF"
      setUint32(length - 8);
      setUint32(0x45564157); // "WAVE"
      setUint32(0x20746d66); // "fmt "
      setUint32(16);
      setUint16(1);
      setUint16(numOfChan);
      setUint32(sampleRate);
      setUint32(sampleRate * 2 * numOfChan);
      setUint16(numOfChan * 2);
      setUint16(16);
      setUint32(0x61746164); // "data"
      setUint32(length - pos - 4);

      for (let i = 0; i < buffer.numberOfChannels; i++) {
        channels.push(buffer.getChannelData(i));
      }

      const CHUNK_SIZE = Math.max(100000, Math.floor(buffer.length / 20));

      const processChunk = () => {
        const end = Math.min(offset + CHUNK_SIZE, buffer.length);
        while (offset < end) {
          for (let i = 0; i < numOfChan; i++) {
            let sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = sample < 0 ? sample * 32768 : sample * 32767;
            out.setInt16(pos, sample, true);
            pos += 2;
          }
          offset++;
        }
        
        if (offset < buffer.length) {
          setAudioTimelineProgress(`95% Đang mã hóa WAV (${Math.round((offset / buffer.length) * 100)}%)...`);
          setTimeout(processChunk, 0);
        } else {
          resolve(new Blob([bufferArr], { type: 'audio/wav' }));
        }
      };
      processChunk();
    });
  };

  const generateAudioTimeline = useCallback(async () => {
    if (subtitles.length === 0) {
      alert("Không tìm thấy phân đoạn phụ đề để tạo timeline!");
      return;
    }
    if (!videoDuration) {
      alert("Vui lòng nạp video trước khi tạo lồng tiếng!");
      return;
    }

    setIsGeneratingAudioTimeline(true);
    setAudioTimelineProgress("0% Khởi tạo Audio Engine...");

    try {
      const { finalBuffer, videoPlaybackRate: computedRate, finalAudioPositions, syncCheckpoints } = await buildDubbedAudioTrackV2(
        subtitles,
        videoDuration,
        voiceProfile,
        audioCacheRef,
        (msg) => setAudioTimelineProgress(msg),
        sessionId
      );

      setAudioTimelineProgress("95% Đang mã hoá WAV...");
      const wavBlob = await audioBufferToWav(finalBuffer);
      const url = URL.createObjectURL(wavBlob);

      setGeneratedAudioUrl(url);
      setVideoPlaybackRate(computedRate);
      setDubAudioPositions(finalAudioPositions);
      setSyncCheckpoints(syncCheckpoints);
      setAudioTimelineProgress("100% Đã hoàn thành! Đã ghép âm thanh vào Video Preview.");
    } catch (err: any) {
      console.error("Lỗi xuất timeline audio:", err);
      alert("Lỗi xuất timeline audio: " + err.message);
    } finally {
      setIsGeneratingAudioTimeline(false);
      setAudioTimelineProgress("");
    }
  }, [subtitles, videoDuration, voiceProfile, audioCacheRef, sessionId, setVideoPlaybackRate]);

  return {
    subtitles, setSubtitles,
    currentSubtitle, setCurrentSubtitle,
    generatedAudioUrl, setGeneratedAudioUrl,
    dubAudioPositions, syncCheckpoints,
    voiceProfile, setVoiceProfile,
    isAiVoiceActive, setIsAiVoiceActive,
    sessionId, setSessionId,
    loadingSegmentIndex,
    isGeneratingAudioTimeline, audioTimelineProgress,
    handlePreviewSegment, generateAudioTimeline
  };
};
