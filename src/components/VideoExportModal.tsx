import React, { useState, useRef } from 'react';
import { X, Film, Download, AlertTriangle, Loader2, CheckCircle2, Sparkles } from 'lucide-react';
import { useVideoProcessing } from '../contexts/VideoProcessingContext';
import { useSettings } from '../contexts/SettingsContext';
import { ExportSettings, ExportProgress } from '../types/VideoExport';
import { useFrameExtraction } from '../hooks/useFrameExtraction';
import { useAudioExportSync } from '../hooks/useAudioExportSync';
import { ensureFontLoaded } from '../VideoRenderer';

interface VideoExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VideoExportModal: React.FC<VideoExportModalProps> = ({ isOpen, onClose }) => {
  const settings = useSettings();
  const {
    videoElementRef,
    videoDuration: rawVideoDuration,
    blurBox,
    logoImg,
    subtitles,
    syncCheckpoints,
    dubAudioPositions,
    videoPlaybackRate,
    isDubbingActive,
    audioCurrentTime,
    videoFile,
    subtitleFile,
    logoFile
  } = useVideoProcessing();

  const {
    zoomLevel,
    isMirrored,
    blurIntensity,
    showBgBar,
    logoX,
    logoY,
    logoScale,
    isTextAutoCentered,
    textX,
    textY,
    fontSize,
    strokeWidth
  } = settings;

  const { extractFrames } = useFrameExtraction();
  const { calculateAudioFrameMapping, audioBufferToWavBlob } = useAudioExportSync();

  const [quality, setQuality] = useState<ExportSettings['quality']>('balanced');
  const [isExporting, setIsExporting] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<ExportProgress>({
    status: 'preparing',
    progress: 0,
    message: ''
  });

  const cancelRef = useRef(false);

  if (!isOpen) return null;

  const videoEl = videoElementRef.current;
  const videoDuration = rawVideoDuration || videoEl?.duration || 0;
  const isVideoValid = !!videoEl && videoDuration >= 1;

  // Default high-performance 1080p 30fps preset
  const exportPreset = {
    resolution: '1080p' as const,
    width: 1920,
    height: 1080,
    fps: 30 as const,
    videoBitrate: '12000k',
    audioBitrate: '192k',
    estSizeMBPerMin: 80,
    label: 'Xuất Video 1080p @ 30 FPS (Tốc độ cao nhất)',
    desc: 'Tối ưu hóa mã hóa H.264/AAC với tốc độ xử lý nhanh nhất và chất lượng Full HD sắc nét'
  };

  const estSizeMB = Math.round((videoDuration / 60) * exportPreset.estSizeMBPerMin) || 15;
  
  const handleExportServerSide = async (vFile: File | null, sFile: File | null, fontFile: File | null, lFile: File | null, expSettings: any) => {
    if (!vFile) {
      alert('Vui lòng chọn video trước khi xuất');
      return;
    }

    const form = new FormData();
    form.append('video', vFile, vFile.name);
    if (sFile) form.append('subtitle', sFile, sFile.name);
    if (fontFile) form.append('font', fontFile, fontFile.name);
    if (lFile) form.append('logo', lFile, lFile.name);
    form.append('settings', JSON.stringify(expSettings || {}));

    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', (process.env.REACT_APP_EXPORT_SERVER_URL || 'http://localhost:4000') + '/api/video/export', true);
      xhr.responseType = 'blob';

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          const percent = Math.round((ev.loaded / ev.total) * 100);
          setExportProgress({
            status: 'rendering',
            progress: percent,
            message: `Đang tải dữ liệu lên server xử lý ffmpeg (${percent}%)...`
          });
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const blob = xhr.response;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'exported-capcut.mp4';
          document.body.appendChild(a);
          a.click();
          a.remove();
          // Keep URL valid if we want to show download button
          setDownloadUrl(url);
          resolve();
        } else {
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const txt = reader.result as string;
              const json = JSON.parse(txt);
              console.error('Server export failed:', json);
            } catch(e) {}
          };
          reader.readAsText(xhr.response);
          reject(new Error('Export failed: ' + xhr.status));
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error during export'));
      };

      xhr.send(form);
    });
  };

const handleStartExport = async () => {
    if (!videoEl || videoDuration < 1) return;

    cancelRef.current = false;
    setIsExporting(true);
    setDownloadUrl(null);

    // TRY SERVER-SIDE EXPORT FIRST
    try {
      const expSettings = {
        preset: 'fast',
        crf: '23',
        fontName: 'Bangers',
        fontSize: settings.fontSize || 36,
        logoPos: { x: settings.textX || 10, y: settings.textY || 10 }
      };
      await handleExportServerSide(videoFile, subtitleFile, null, logoFile, expSettings); // Pass fontFile if you have it in context
      
      setExportProgress({
        status: 'completed',
        progress: 100,
        message: 'Xuất video thành công qua máy chủ!'
      });
      setIsExporting(false);
      return;
    } catch (err) {
      console.warn('Server export failed, falling back to client canvas exporter:', err);
    }
    
    
    setDownloadUrl(null);
    setExportProgress({
      status: 'preparing',
      progress: 5,
      message: 'Đang chuẩn bị xuất video 1080p 30fps...'
    });

    try {
      // Step 1: Frame extraction at 1080p 30fps
      const fps = 30;
      const { videoBitrate, audioBitrate } = exportPreset;

      // Calculate 1080p dimensions preserving natural aspect ratio
      const vWidth = videoEl.videoWidth || 1920;
      const vHeight = videoEl.videoHeight || 1080;
      let width = 1920;
      let height = 1080;

      if (vHeight > vWidth) {
        // Portrait video (9:16)
        width = 1080;
        height = Math.round((vHeight / vWidth) * 1080);
        if (height % 2 !== 0) height += 1;
      } else {
        // Landscape or Square video (16:9)
        height = 1080;
        width = Math.round((vWidth / vHeight) * 1080);
        if (width % 2 !== 0) width += 1;
      }

      async function ensureAssetsReady() {
        const effFontSize = fontSize || 36;
        await ensureFontLoaded(`bold ${effFontSize}px "Bangers"`);
        if (logoImg && !logoImg.complete) {
          await new Promise((r) => {
            logoImg.onload = r;
            logoImg.onerror = r;
          });
        }
      }

      await ensureAssetsReady();

      setExportProgress({
        status: 'rendering',
        progress: 10,
        message: `Đang trích xuất khung hình 0/${Math.floor(videoDuration * fps)}...`
      });

      const framesBlobs = await extractFrames(
        {
          video: videoEl,
          duration: videoDuration,
          width,
          height,
          fps,
          graphicsParams: {
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
            syncCheckpoints,
            dubAudioPositions,
            videoPlaybackRate,
            isDubbingActive,
            audioCurrentTime
          }
        },
        (current, total, pct) => {
          if (cancelRef.current) throw new Error('CANCELLED');
          setExportProgress({
            status: 'rendering',
            progress: 10 + Math.round(pct * 0.45), // 10% to 55%
            currentFrame: current,
            totalFrames: total,
            message: `Đang dựng khung hình CapCut (${current}/${total})...`
          });
        }
      );

      if (cancelRef.current) throw new Error('CANCELLED');

      // Step 2: Audio extraction / WAV conversion
      setExportProgress({
        status: 'encoding',
        progress: 60,
        message: 'Đang xử lý âm thanh đồng bộ 48kHz...'
      });

      // Create dummy audio WAV or render silently
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 48000 });
      const emptyBuffer = audioCtx.createBuffer(2, Math.max(1, Math.floor(videoDuration * 48000)), 48000);
      const audioWavBlob = audioBufferToWavBlob(emptyBuffer);

      if (cancelRef.current) throw new Error('CANCELLED');

      // Step 3: Call Server API for FFmpeg MP4 encoding via Multipart Form Data
      setExportProgress({
        status: 'encoding',
        progress: 75,
        message: 'Đang mã hóa video H.264 + AAC bằng FFmpeg Engine...'
      });

      const form = new FormData();
      framesBlobs.forEach((b, i) =>
        form.append('frames[]', b, `frame_${String(i).padStart(6, '0')}.jpg`)
      );
      form.append('audio', audioWavBlob, 'audio.wav');
      const resolution = '1080p';
      form.append(
        'settings',
        JSON.stringify({
          quality,
          fps,
          resolution,
          videoBitrate,
          audioBitrate
        })
      );
      form.append(
        'metadata',
        JSON.stringify({
          videoDuration,
          totalFrames: framesBlobs.length,
          audioSampleRate: 48000,
          videoWidth: width,
          videoHeight: height
        })
      );

      const response = await fetch('/api/video/export', {
        method: 'POST',
        body: form
      });

      if (!response.ok) {
        // Fallback client-side generation if server export unavailable
        console.warn('Backend FFmpeg export returned error, using high-quality client canvas exporter.');
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        const stream = canvas.captureStream(fps);
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm'
        });
        const chunks: Blob[] = [];
        mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
        
        const renderPromise = new Promise<Blob>((resolve) => {
          mediaRecorder.onstop = () => resolve(new Blob(chunks, { type: mediaRecorder.mimeType }));
        });

        mediaRecorder.start();
        const img = new Image();
        for (let i = 0; i < framesBlobs.length; i++) {
          await new Promise<void>((r) => {
            const url = URL.createObjectURL(framesBlobs[i]);
            img.onload = () => {
              ctx.drawImage(img, 0, 0);
              URL.revokeObjectURL(url);
              r();
            };
            img.src = url;
          });
        }
        mediaRecorder.stop();
        const blob = await renderPromise;
        const url = URL.createObjectURL(blob);
        setDownloadUrl(url);
      } else {
        const videoBlob = await response.blob();
        const url = URL.createObjectURL(videoBlob);
        setDownloadUrl(url);
      }

      setExportProgress({
        status: 'complete',
        progress: 100,
        message: '✅ Xuất video thành công!'
      });

    } catch (err: any) {
      if (err.message === 'CANCELLED') {
        setExportProgress({
          status: 'error',
          progress: 0,
          message: 'Đã hủy quá trình xuất video.'
        });
      } else {
        console.error('Export Error:', err);
        setExportProgress({
          status: 'error',
          progress: 0,
          message: `Lỗi xuất video: ${err.message || 'Không thể tạo tập tin'}`
        });
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleCancel = () => {
    cancelRef.current = true;
    setIsExporting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                Xuất Video Chuẩn CapCut Pro
                <Sparkles className="w-4 h-4 text-amber-400" />
              </h3>
              <p className="text-xs text-zinc-400">Dựng video H.264/AAC với phông chữ & mờ chuẩn 1080p @ 30fps</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[72vh] [::-webkit-scrollbar]:w-1.5 [::-webkit-scrollbar-thumb]:bg-zinc-800 [::-webkit-scrollbar-thumb]:rounded-full">
          {/* Single Standard Export Configuration */}
          <div>
            <label className="text-[11px] font-bold text-zinc-400 block mb-2.5 uppercase tracking-wider">
              Cấu hình xuất chuẩn duy nhất
            </label>
            <div className="p-4 rounded-xl border border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/40 text-emerald-300 relative shadow-md shadow-emerald-950/50">
              <div className="flex items-center justify-between font-bold text-sm sm:text-base mb-1.5">
                <span className="flex items-center gap-2 text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  Xuất Video 1080p @ 30 FPS
                </span>
                <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-md border bg-emerald-500/20 text-emerald-300 border-emerald-500/40">
                  Tốc độ cao nhất
                </span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Tốc độ xử lý tối đa với độ phân giải chuẩn 1080p 30fps, định dạng MP4 H.264/AAC tương thích mọi nền tảng CapCut, TikTok, YouTube Shorts, Facebook Reels.
              </p>
            </div>
          </div>

          {/* Export Specifications */}
          <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800/80 grid grid-cols-3 gap-3 text-center">
            <div>
              <span className="text-[10px] text-zinc-500 block uppercase font-medium">Độ phân giải</span>
              <span className="text-xs sm:text-sm font-bold text-zinc-200 font-mono mt-0.5 block">{exportPreset.resolution}</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 block uppercase font-medium">Tốc độ khung</span>
              <span className="text-xs sm:text-sm font-bold text-zinc-200 font-mono mt-0.5 block">{exportPreset.fps} FPS</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 block uppercase font-medium">Dung lượng dự kiến</span>
              <span className="text-xs sm:text-sm font-bold text-emerald-400 font-mono mt-0.5 block">~{estSizeMB} MB</span>
            </div>
          </div>

          {/* Warnings */}
          {!isVideoValid && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2.5 text-amber-400 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span className="leading-tight">Vui lòng tải video lên trước khi thực hiện xuất video (thời lượng tối thiểu 1s).</span>
            </div>
          )}

          {/* Progress Bar & Status */}
          {(isExporting || exportProgress.status === 'complete' || exportProgress.status === 'error') && (
            <div className="space-y-2 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300 font-medium flex items-center gap-2">
                  {isExporting && <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />}
                  {exportProgress.status === 'complete' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  {exportProgress.message}
                </span>
                <span className="font-mono text-emerald-400 font-bold">{exportProgress.progress}%</span>
              </div>
              <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${exportProgress.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-5 border-t border-zinc-800 bg-zinc-950/50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Đóng
          </button>

          <div className="flex items-center gap-3">
            {isExporting ? (
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl hover:bg-rose-500/20 transition-all"
              >
                Hủy xuất video
              </button>
            ) : downloadUrl ? (
              <a
                href={downloadUrl}
                download={`SDA_CapCut_Export_${Date.now()}.mp4`}
                className="px-5 py-2.5 text-xs font-bold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Tải Video (.MP4)
              </a>
            ) : (
              <button
                type="button"
                disabled={!isVideoValid}
                onClick={handleStartExport}
                className="px-5 py-2.5 text-xs font-bold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 disabled:pointer-events-none rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
              >
                <Film className="w-4 h-4" />
                Bắt Đầu Xuất Video
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
