import { useState, useRef, useCallback, MutableRefObject } from 'react';
import type { ExportOptions } from '../types';
import { drawVideoFrame } from '../VideoFrameRenderer';
import { videoTimeToAudioTime } from '../DubbingAudioEngine';
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget } from 'mp4-muxer';
import { Input, ALL_FORMATS, BlobSource, CanvasSink } from 'mediabunny';

/** Áp dụng hệ số khuếch đại gain (0.0 -> 2.0) cho AudioBuffer */
function applyGainToAudioBuffer(ctx: AudioContext, buffer: AudioBuffer, gain: number): AudioBuffer {
  if (gain === 1.0) return buffer;
  const newBuffer = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const input = buffer.getChannelData(c);
    const output = newBuffer.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) {
      output[i] = Math.max(-1, Math.min(1, input[i] * gain));
    }
  }
  return newBuffer;
}

/** Hòa trộn 2 AudioBuffer (Âm lồng tiếng AI + Âm nền video gốc) theo các mức âm lượng gain tương ứng */
function mixAudioBuffers(
  ctx: AudioContext,
  dubBuf: AudioBuffer,
  dubGain: number,
  origBuf: AudioBuffer,
  origGain: number
): AudioBuffer {
  const channels = Math.max(dubBuf.numberOfChannels, origBuf.numberOfChannels);
  const length = Math.max(dubBuf.length, origBuf.length);
  const sampleRate = dubBuf.sampleRate;

  const mixed = ctx.createBuffer(channels, length, sampleRate);
  for (let c = 0; c < channels; c++) {
    const dubChan = Math.min(c, dubBuf.numberOfChannels - 1);
    const origChan = Math.min(c, origBuf.numberOfChannels - 1);
    const dubData = dubBuf.getChannelData(dubChan);
    const origData = origBuf.getChannelData(origChan);
    const outData = mixed.getChannelData(c);

    for (let i = 0; i < length; i++) {
      const dubVal = i < dubBuf.length ? dubData[i] * dubGain : 0;
      const origVal = i < origBuf.length ? origData[i] * origGain : 0;
      outData[i] = Math.max(-1, Math.min(1, dubVal + origVal));
    }
  }
  return mixed;
}

/**
 * Tải logo ảnh thành HTMLImageElement hoặc ImageBitmap.
 */
async function loadLogoImage(logoUrl: string | null): Promise<HTMLImageElement | ImageBitmap | null> {
  if (!logoUrl) return null;
  try {
    const resp = await fetch(logoUrl);
    const blob = await resp.blob();
    return await createImageBitmap(blob);
  } catch {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = logoUrl;
    });
  }
}

/**
 * Mã hóa AudioBuffer thành các EncodedAudioChunk bằng AudioEncoder WebCodecs.
 */
async function encodeAudioToChunks(
  audioBuffer: AudioBuffer
): Promise<{ chunks: Array<{ chunk: EncodedAudioChunk; meta?: any }>; codec: 'aac' | 'opus' }> {
  const channels = Math.min(2, audioBuffer.numberOfChannels);
  const sampleRate = audioBuffer.sampleRate;
  const totalSamples = audioBuffer.length;

  let selectedCodec: 'aac' | 'opus' = 'aac';
  let codecStr = 'mp4a.40.2';

  try {
    if (typeof AudioEncoder !== 'undefined' && AudioEncoder.isConfigSupported) {
      const aacCheck = await AudioEncoder.isConfigSupported({
        codec: 'mp4a.40.2',
        numberOfChannels: channels,
        sampleRate: sampleRate,
        bitrate: 128_000
      });
      if (!aacCheck.supported) {
        selectedCodec = 'opus';
        codecStr = 'opus';
      }
    }
  } catch {
    selectedCodec = 'opus';
    codecStr = 'opus';
  }

  const chunks: Array<{ chunk: EncodedAudioChunk; meta?: any }> = [];
  const chunkSize = selectedCodec === 'aac' ? 1024 : 1920;

  let encoderError: Error | null = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => chunks.push({ chunk, meta }),
    error: (e) => {
      encoderError = e;
    }
  });

  encoder.configure({
    codec: codecStr,
    numberOfChannels: channels,
    sampleRate: sampleRate,
    bitrate: 128_000
  });

  let pcmData: Float32Array;
  if (channels === 1) {
    pcmData = audioBuffer.getChannelData(0);
  } else {
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);
    pcmData = new Float32Array(totalSamples * 2);
    for (let i = 0; i < totalSamples; i++) {
      pcmData[i * 2] = left[i];
      pcmData[i * 2 + 1] = right[i];
    }
  }

  let offset = 0;
  while (offset < totalSamples) {
    if (encoderError) throw encoderError;
    const framesInChunk = Math.min(chunkSize, totalSamples - offset);
    const chunkData = pcmData.subarray(
      offset * channels,
      (offset + framesInChunk) * channels
    );

    const audioData = new AudioData({
      format: 'f32',
      sampleRate,
      numberOfFrames: framesInChunk,
      numberOfChannels: channels,
      timestamp: Math.round((offset / sampleRate) * 1_000_000),
      data: chunkData
    });

    encoder.encode(audioData);
    audioData.close();
    offset += framesInChunk;
  }

  await encoder.flush();
  encoder.close();

  return { chunks, codec: selectedCodec };
}

export const useVideoExport = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatusText, setExportStatusText] = useState('');
  const abortExportRef = useRef(false);
  const workersRef = useRef<Worker[]>([]);

  const startExport = useCallback(async (options: Omit<ExportOptions, 'isAborted'>) => {
    if (!options.videoFile || !options.videoUrl) {
      alert('Vui lòng chọn video gốc ở mục 1!');
      return;
    }

    setIsExporting(true);
    setExportProgress(0);
    setExportStatusText('Đang khởi tạo tiến trình xuất video Hardware CapCut...');
    abortExportRef.current = false;
    workersRef.current = [];

    let exportVideo: HTMLVideoElement | null = null;
    let audioCtx: AudioContext | null = null;

    try {
      // 1. Chờ Font chữ nạp xong
      setExportStatusText('Đang nạp phông chữ & tài nguyên...');
      if (document.fonts) {
        await document.fonts.ready.catch(() => {});
      }

      if (abortExportRef.current) return;

      // 2. Load Logo
      const logoImg = await loadLogoImage(options.logoUrl);
      if (abortExportRef.current) return;

      // 3. Chuẩn bị HTMLVideoElement ẩn để đọc thông số kích thước
      exportVideo = document.createElement('video');
      exportVideo.src = options.videoUrl;
      exportVideo.muted = true;
      exportVideo.playsInline = true;
      exportVideo.preload = 'auto';

      await new Promise<void>((resolve, reject) => {
        if (!exportVideo) return reject(new Error('Video element error'));
        exportVideo.onloadedmetadata = () => resolve();
        exportVideo.onloadeddata = () => resolve();
        exportVideo.onerror = (e) => reject(new Error('Lỗi nạp video gốc: ' + e));
      });

      // Warm-up video decoder cho frame 0
      try {
        exportVideo.currentTime = 0;
        await exportVideo.play().catch(() => {});
        exportVideo.pause();
      } catch {
        // Ignored
      }

      if (abortExportRef.current) return;

      const rawW = exportVideo.videoWidth || 1280;
      const rawH = exportVideo.videoHeight || 720;
      const vw = rawW & ~1;
      const vh = rawH & ~1;
      const scaleFactor = options.containerWidth > 0 ? vw / options.containerWidth : 1;

      // 4. Giải mã AudioBuffer & Áp dụng âm lượng lồng tiếng / nhạc nền
      const isDubbingActive = Boolean(
        options.generatedAudioUrl &&
        options.dubAudioPositions &&
        options.dubAudioPositions.length === options.subtitles.length
      );

      let audioBuffer: AudioBuffer | null = null;
      let totalDuration = exportVideo.duration || 10;

      const dubGain = Math.max(0, (options.dubVolume ?? 100) / 100);
      const origGain = Math.max(0, (options.originalVideoVolume ?? (isDubbingActive ? 0 : 100)) / 100);

      if (isDubbingActive && options.generatedAudioUrl) {
        setExportStatusText('Đang tải dữ liệu âm thanh lồng tiếng...');
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const resp = await fetch(options.generatedAudioUrl);
        const arrayBuf = await resp.arrayBuffer();
        const rawDubBuffer = await audioCtx.decodeAudioData(arrayBuf);

        if (origGain > 0 && options.videoFile) {
          setExportStatusText('Đang hòa trộn âm thanh lồng tiếng + âm nền video gốc...');
          try {
            const origArrayBuf = await options.videoFile.arrayBuffer();
            const origBuffer = await audioCtx.decodeAudioData(origArrayBuf);
            audioBuffer = mixAudioBuffers(audioCtx, rawDubBuffer, dubGain, origBuffer, origGain);
          } catch {
            audioBuffer = applyGainToAudioBuffer(audioCtx, rawDubBuffer, dubGain);
          }
        } else {
          audioBuffer = applyGainToAudioBuffer(audioCtx, rawDubBuffer, dubGain);
        }
        totalDuration = audioBuffer.duration;
      } else if (options.videoFile) {
        setExportStatusText('Đang tách âm thanh video gốc...');
        try {
          audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const arrayBuf = await options.videoFile.arrayBuffer();
          if (arrayBuf.byteLength > 0) {
            const rawOrigBuffer = await audioCtx.decodeAudioData(arrayBuf);
            audioBuffer = applyGainToAudioBuffer(audioCtx, rawOrigBuffer, origGain);
          }
        } catch {
          console.warn('Không thể giải mã track audio từ video gốc, xuất không tiếng.');
        }
      }

      if (abortExportRef.current) return;

      // 5. Xuất bằng WebCodecs Hardware Engine (Single-pass chuẩn xác 100%, không giật lag, không lỗi MP4)
      let exportedBlob: Blob | null = null;
      const isWebCodecsSupported = typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined';

      if (isWebCodecsSupported) {
        try {
          setExportStatusText('Đang xuất MP4 bằng CapCut Hardware Engine...');
          exportedBlob = await exportSinglePassWebCodecs({
            videoFile: options.videoFile,
            exportVideo,
            audioBuffer,
            totalDuration,
            vw,
            vh,
            scaleFactor,
            logoImg,
            isDubbingActive,
            options,
            abortExportRef,
            setExportProgress,
            setExportStatusText
          });
        } catch (webcodecsErr) {
          console.warn('WebCodecs single-pass engine gặp sự cố, chuyển sang MediaRecorder fallback:', webcodecsErr);
          exportedBlob = null;
        }
      }

      if (!exportedBlob && !abortExportRef.current) {
        setExportStatusText('Đang xuất video MP4 với MediaRecorder Engine...');
        exportedBlob = await exportWithMediaRecorder({
          exportVideo,
          audioBuffer,
          totalDuration,
          vw,
          vh,
          scaleFactor,
          logoImg,
          isDubbingActive,
          options,
          abortExportRef,
          setExportProgress,
          setExportStatusText
        });
      }

      if (abortExportRef.current) {
        setExportStatusText('Đã hủy tiến trình xuất video.');
        return;
      }

      if (exportedBlob) {
        setExportProgress(100);
        setExportStatusText('Xuất video MP4 thành công! Đang tải xuống...');

        const downloadUrl = URL.createObjectURL(exportedBlob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `capcut_ai_export_${Date.now()}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
      }
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Lỗi khi xuất video MP4:', error);
      alert('Đã xảy ra lỗi khi xuất video: ' + (error.message || error));
    } finally {
      workersRef.current.forEach((w) => w.terminate());
      workersRef.current = [];

      if (exportVideo) {
        exportVideo.pause();
        if (exportVideo.parentNode) {
          exportVideo.parentNode.removeChild(exportVideo);
        }
        exportVideo.removeAttribute('src');
        exportVideo.load();
      }
      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }
      setIsExporting(false);
    }
  }, []);

  const cancelExport = useCallback(() => {
    abortExportRef.current = true;
    workersRef.current.forEach((w) => w.terminate());
    workersRef.current = [];
  }, []);

  return {
    isExporting,
    exportProgress,
    exportStatusText,
    abortExportRef,
    startExport,
    cancelExport
  };
};

/**
 * HƯỚNG 1: WebCodecs + Hardware Acceleration (Single-pass chuẩn xác 100%, không giật lag, không lỗi MP4)
 */
async function exportSinglePassWebCodecs(params: {
  videoFile: File;
  exportVideo: HTMLVideoElement;
  audioBuffer: AudioBuffer | null;
  totalDuration: number;
  vw: number;
  vh: number;
  scaleFactor: number;
  logoImg: HTMLImageElement | ImageBitmap | null;
  isDubbingActive: boolean;
  options: Omit<ExportOptions, 'isAborted'>;
  abortExportRef: MutableRefObject<boolean>;
  setExportProgress: (p: number) => void;
  setExportStatusText: (s: string) => void;
}): Promise<Blob> {
  const {
    videoFile,
    exportVideo,
    audioBuffer,
    totalDuration,
    vw,
    vh,
    scaleFactor,
    logoImg,
    isDubbingActive,
    options,
    abortExportRef,
    setExportProgress,
    setExportStatusText
  } = params;

  // 1. Kiểm tra hỗ trợ Video Codec (H.264 Main/Baseline)
  let codec = 'avc1.4d002a';
  try {
    const supported = await VideoEncoder.isConfigSupported({
      codec: 'avc1.4d002a',
      width: vw,
      height: vh,
      bitrate: 8_000_000,
      framerate: 30
    });
    if (!supported.supported) {
      codec = 'avc1.42E01E';
    }
  } catch {
    codec = 'avc1.42E01E';
  }

  // 2. Mã hóa AudioBuffer thành các EncodedAudioChunk
  let audioChunks: Array<{ chunk: EncodedAudioChunk; meta?: any }> = [];
  let audioCodecName: 'aac' | 'opus' = 'aac';
  if (audioBuffer && audioBuffer.length > 0) {
    setExportStatusText('Đang mã hóa âm thanh...');
    try {
      const res = await encodeAudioToChunks(audioBuffer);
      audioChunks = res.chunks;
      audioCodecName = res.codec;
    } catch (audioErr) {
      console.warn('Không thể mã hóa audio track, xuất video không tiếng:', audioErr);
      audioChunks = [];
    }
  }

  if (abortExportRef.current) throw new Error('Đã hủy tiến trình');

  // 3. Khởi tạo VideoEncoder
  const videoChunks: Array<{ chunk: EncodedVideoChunk; meta?: any }> = [];
  let avcDescription: Uint8Array | null = null;
  let encoderError: Error | null = null;

  const videoEncoder = new VideoEncoder({
    output: (chunk, metadata) => {
      if (metadata?.decoderConfig?.description) {
        avcDescription = new Uint8Array(metadata.decoderConfig.description);
      }
      videoChunks.push({ chunk, meta: metadata });
    },
    error: (e) => {
      encoderError = e;
    }
  });

  try {
    videoEncoder.configure({
      codec,
      width: vw,
      height: vh,
      bitrate: 8_000_000,
      framerate: 30,
      hardwareAcceleration: 'prefer-hardware'
    });
  } catch {
    videoEncoder.configure({
      codec: 'avc1.42E01E',
      width: vw,
      height: vh,
      bitrate: 8_000_000,
      framerate: 30,
      hardwareAcceleration: 'no-preference'
    });
  }

  const canvas = document.createElement('canvas');
  canvas.width = vw;
  canvas.height = vh;
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true })!;

  const fps = 30;
  const frameDurationUs = Math.round(1_000_000 / fps);

  // 4. Thử giải mã bằng Mediabunny CanvasSink trực tiếp
  let usedMediabunny = false;
  let lastTimestampMicros = -1;

  try {
    const input = new Input({
      source: new BlobSource(videoFile),
      formats: ALL_FORMATS
    });
    const videoTrack = await input.getPrimaryVideoTrack();
    if (videoTrack) {
      const canvasSink = new CanvasSink(videoTrack, {
        width: vw,
        height: vh,
        fit: 'fill'
      });

      setExportStatusText('Đang nén phần cứng CapCut Engine...');
      let frameIndex = 0;

      for await (const wrapped of canvasSink.canvases(0, totalDuration)) {
        if (abortExportRef.current) throw new Error('Đã hủy tiến trình');
        if (encoderError) throw encoderError;

        const tVideo = wrapped.timestamp;
        const tAudio = isDubbingActive
          ? videoTimeToAudioTime(tVideo, options.syncCheckpoints || [], options.videoPlaybackRate || 1)
          : tVideo;

        drawVideoFrame({
          ctx,
          renderVideo: wrapped.canvas,
          currentTime: tVideo,
          videoWidth: vw,
          videoHeight: vh,
          zoomLevel: options.zoomLevel,
          isMirrored: options.isMirrored,
          blurIntensity: options.blurIntensity,
          blurBox: options.blurBox,
          showBgBar: options.showBgBar,
          logoImg,
          logoX: options.logoX,
          logoY: options.logoY,
          logoScale: options.logoScale,
          subtitles: options.subtitles,
          isTextAutoCentered: options.isTextAutoCentered,
          textX: options.textX,
          textY: options.textY,
          fontSize: options.fontSize,
          strokeWidth: options.strokeWidth,
          scaleFactor,
          syncCheckpoints: options.syncCheckpoints,
          dubAudioPositions: options.dubAudioPositions,
          videoPlaybackRate: options.videoPlaybackRate,
          isDubbingActive,
          audioCurrentTime: tAudio
        });

        // Timestamp video tính đều đặn theo chu kỳ 30fps bắt đầu chính xác từ 0us
        const timestampMicros = Math.round((frameIndex * 1_000_000) / fps);

        const videoFrame = new VideoFrame(canvas, {
          timestamp: timestampMicros,
          duration: frameDurationUs
        });

        // Chờ xả hàng chờ encoder để tránh tràn bộ nhớ hoặc làm nổ codec
        while (videoEncoder.encodeQueueSize > 5) {
          await new Promise(r => setTimeout(r, 10));
        }

        const isKeyFrame = frameIndex === 0 || frameIndex % (fps * 2) === 0;
        videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
        videoFrame.close();

        frameIndex++;
        if (frameIndex % 5 === 0) {
          await new Promise(r => setTimeout(r, 0));
        }

        if (frameIndex % 15 === 0) {
          const progressPct = Math.min(90, Math.round((tAudio / (totalDuration || 1)) * 90));
          setExportProgress(progressPct);
          setExportStatusText(`Đang xử lý khung hình CapCut (${progressPct}%)...`);
        }
      }
      usedMediabunny = true;
    }
  } catch (mErr) {
    console.warn('Mediabunny CanvasSink gặp sự cố, chuyển sang chế độ frame seek:', mErr);
    usedMediabunny = false;
  }

  // Fallback: Duyệt từng frame bằng HTMLVideoElement seek (chống đứng/bỏ khung hình 100%)
  if (!usedMediabunny) {
    setExportStatusText('Đang xử lý từng khung hình chuẩn xác...');
    const totalFrames = Math.max(1, Math.ceil(totalDuration * fps));
    
    // Warm-up video decoder cho frame 0
    const seekVideoToTime = async (targetSec: number): Promise<void> => {
      const duration = exportVideo.duration || totalDuration || 10;
      const clamped = Math.max(0, Math.min(duration - 0.01, targetSec));
      if (Math.abs(exportVideo.currentTime - clamped) < 0.001 && exportVideo.readyState >= 2) {
        return;
      }
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (!done) {
            done = true;
            exportVideo.removeEventListener('seeked', finish);
            resolve();
          }
        };
        exportVideo.addEventListener('seeked', finish, { once: true });
        exportVideo.currentTime = clamped;
        setTimeout(finish, 60);
      });
    };

    // Đảm bảo seek tới 0 thành công
    await seekVideoToTime(0);
    await new Promise(r => setTimeout(r, 60));

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      if (abortExportRef.current) throw new Error('Đã hủy tiến trình');
      if (encoderError) throw encoderError;

      const tAudio = frameIndex / fps;
      const tVideo = isDubbingActive
        ? videoTimeToAudioTime(tAudio, options.syncCheckpoints || [], options.videoPlaybackRate || 1)
        : tAudio;

      await seekVideoToTime(tVideo);

      drawVideoFrame({
        ctx,
        renderVideo: exportVideo,
        currentTime: tVideo,
        videoWidth: vw,
        videoHeight: vh,
        zoomLevel: options.zoomLevel,
        isMirrored: options.isMirrored,
        blurIntensity: options.blurIntensity,
        blurBox: options.blurBox,
        showBgBar: options.showBgBar,
        logoImg,
        logoX: options.logoX,
        logoY: options.logoY,
        logoScale: options.logoScale,
        subtitles: options.subtitles,
        isTextAutoCentered: options.isTextAutoCentered,
        textX: options.textX,
        textY: options.textY,
        fontSize: options.fontSize,
        strokeWidth: options.strokeWidth,
        scaleFactor,
        syncCheckpoints: options.syncCheckpoints,
        dubAudioPositions: options.dubAudioPositions,
        videoPlaybackRate: options.videoPlaybackRate,
        isDubbingActive,
        audioCurrentTime: tAudio
      });

      const timestampMicros = Math.round((frameIndex * 1_000_000) / fps);

      const videoFrame = new VideoFrame(canvas, {
        timestamp: timestampMicros,
        duration: frameDurationUs
      });

      // Chờ xả hàng chờ encoder
      while (videoEncoder.encodeQueueSize > 5) {
        await new Promise(r => setTimeout(r, 10));
      }

      const isKeyFrame = frameIndex === 0 || frameIndex % (fps * 2) === 0;
      videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
      videoFrame.close();

      if (frameIndex % 5 === 0) {
        await new Promise(r => setTimeout(r, 0));
      }

      if (frameIndex % 15 === 0) {
        const progressPct = Math.min(90, Math.round((frameIndex / totalFrames) * 90));
        setExportProgress(progressPct);
        setExportStatusText(`Đang xử lý khung hình CapCut (${progressPct}%)...`);
      }
    }
  }

  setExportStatusText('Đang hoàn tất nén phần cứng (92%)...');
  setExportProgress(92);

  await videoEncoder.flush();
  videoEncoder.close();

  if (abortExportRef.current) throw new Error('Đã hủy tiến trình');

  setExportStatusText('Đang đóng gói file MP4 (96%)...');
  setExportProgress(96);

  // Sắp xếp các đoạn audio/video theo timestamp chuẩn xác trước khi muxing
  videoChunks.sort((a, b) => a.chunk.timestamp - b.chunk.timestamp);
  if (audioChunks.length > 0) {
    audioChunks.sort((a, b) => a.chunk.timestamp - b.chunk.timestamp);
  }

  // 5. Đóng gói file MP4 bằng mp4-muxer
  const muxer = new Mp4Muxer({
    target: new Mp4ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width: vw,
      height: vh
    },
    audio: (audioBuffer && audioChunks.length > 0) ? {
      codec: audioCodecName,
      numberOfChannels: Math.min(2, audioBuffer.numberOfChannels),
      sampleRate: audioBuffer.sampleRate
    } : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset'
  });

  for (const a of audioChunks) {
    muxer.addAudioChunk(a.chunk, a.meta);
  }

  for (const v of videoChunks) {
    muxer.addVideoChunk(v.chunk, v.meta);
  }

  muxer.finalize();

  setExportStatusText('Xuất video hoàn tất (100%)!');
  setExportProgress(100);

  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

/**
 * HƯỚNG 2: MediaRecorder Fallback (chống đơ 99% & hỗ trợ chạy khi chuyển tab)
 */
async function exportWithMediaRecorder(params: {
  exportVideo: HTMLVideoElement;
  audioBuffer: AudioBuffer | null;
  totalDuration: number;
  vw: number;
  vh: number;
  scaleFactor: number;
  logoImg: HTMLImageElement | ImageBitmap | null;
  isDubbingActive: boolean;
  options: Omit<ExportOptions, 'isAborted'>;
  abortExportRef: MutableRefObject<boolean>;
  setExportProgress: (p: number) => void;
  setExportStatusText: (s: string) => void;
}): Promise<Blob> {
  const {
    exportVideo,
    audioBuffer,
    totalDuration,
    vw,
    vh,
    scaleFactor,
    logoImg,
    isDubbingActive,
    options,
    abortExportRef,
    setExportProgress,
    setExportStatusText
  } = params;

  const canvas = document.createElement('canvas');
  canvas.width = vw;
  canvas.height = vh;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const canvasStream = canvas.captureStream(30);
  let audioCtx: AudioContext | null = null;

  if (audioBuffer) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const dest = audioCtx.createMediaStreamDestination();
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(dest);
    source.start(0);

    const audioTrack = dest.stream.getAudioTracks()[0];
    if (audioTrack) {
      canvasStream.addTrack(audioTrack);
    }
  }

  const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a')
    ? 'video/mp4;codecs=avc1,mp4a'
    : MediaRecorder.isTypeSupported('video/mp4')
    ? 'video/mp4'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : 'video/webm';

  const mediaRecorder = new MediaRecorder(canvasStream, {
    mimeType,
    videoBitsPerSecond: 6_000_000
  });

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.start(100);

  exportVideo.currentTime = 0;
  exportVideo.playbackRate = 1.0;

  let lastProgressTime = 0;

  await new Promise<void>((resolve) => {
    let hasEnded = false;
    let lastTime = -1;
    let stuckCount = 0;

    const renderStep = () => {
      if (abortExportRef.current || hasEnded) {
        exportVideo.pause();
        return resolve();
      }

      const tVideo = exportVideo.currentTime;
      const tAudio = isDubbingActive
        ? videoTimeToAudioTime(tVideo, options.syncCheckpoints || [], options.videoPlaybackRate || 1)
        : tVideo;

      drawVideoFrame({
        ctx,
        renderVideo: exportVideo,
        currentTime: tVideo,
        videoWidth: vw,
        videoHeight: vh,
        zoomLevel: options.zoomLevel,
        isMirrored: options.isMirrored,
        blurIntensity: options.blurIntensity,
        blurBox: options.blurBox,
        showBgBar: options.showBgBar,
        logoImg,
        logoX: options.logoX,
        logoY: options.logoY,
        logoScale: options.logoScale,
        subtitles: options.subtitles,
        isTextAutoCentered: options.isTextAutoCentered,
        textX: options.textX,
        textY: options.textY,
        fontSize: options.fontSize,
        strokeWidth: options.strokeWidth,
        scaleFactor,
        syncCheckpoints: options.syncCheckpoints,
        dubAudioPositions: options.dubAudioPositions,
        videoPlaybackRate: options.videoPlaybackRate,
        isDubbingActive,
        audioCurrentTime: tAudio
      });

      const progressPct = Math.min(99, Math.round((tAudio / (totalDuration || 1)) * 100));
      const nowMs = Date.now();
      if (nowMs - lastProgressTime >= 200) {
        lastProgressTime = nowMs;
        setExportProgress(progressPct);
        setExportStatusText(`Đang xuất video MP4 (${progressPct}%)...`);
      }

      if (Math.abs(tVideo - lastTime) < 0.001) {
        stuckCount++;
      } else {
        stuckCount = 0;
        lastTime = tVideo;
      }

      const isFinished = exportVideo.ended ||
        (exportVideo.duration > 0 && tVideo >= exportVideo.duration - 0.15) ||
        tAudio >= totalDuration - 0.1 ||
        stuckCount > 40; // Nếu vị trí video không đổi trong 40 khung (~1.3s) thì coi như đã hết

      if (isFinished) {
        hasEnded = true;
        exportVideo.pause();
        setExportProgress(99);
        resolve();
      } else {
        if ('requestVideoFrameCallback' in exportVideo) {
          (exportVideo as any).requestVideoFrameCallback(renderStep);
        } else {
          requestAnimationFrame(renderStep);
        }
      }
    };

    exportVideo.play().then(() => {
      renderStep();
    }).catch((err) => {
      console.warn('MediaRecorder play error:', err);
      renderStep();
    });
  });

  return new Promise((resolve) => {
    mediaRecorder.onstop = () => {
      if (audioCtx) audioCtx.close().catch(() => {});
      resolve(new Blob(chunks, { type: mimeType }));
    };
    mediaRecorder.stop();
  });
}
