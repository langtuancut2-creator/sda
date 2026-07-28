import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useVideoState } from '../hooks/useVideoState';
import { useTTSPipeline } from '../hooks/useTTSPipeline';
import { useBlurDetection } from '../hooks/useBlurDetection';
import { useVideoExport } from '../hooks/useVideoExport';
import { useSettings } from './SettingsContext';
import { drawVideoFrame } from '../VideoFrameRenderer';

type VideoProcessingContextType = ReturnType<typeof useVideoState> &
  ReturnType<typeof useTTSPipeline> &
  ReturnType<typeof useBlurDetection> &
  ReturnType<typeof useVideoExport> & {
    showPythonModal: boolean;
    setShowPythonModal: React.Dispatch<React.SetStateAction<boolean>>;
    handleFullscreen: () => void;
    handleFileChange: (setter: React.Dispatch<React.SetStateAction<File | null>>) => (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleProcess: () => void;
    videoRef: React.RefObject<HTMLInputElement | null>;
    subtitleRef: React.RefObject<HTMLInputElement | null>;
    logoRef: React.RefObject<HTMLInputElement | null>;
    toolbarRef: React.RefObject<HTMLDivElement | null>;
  };

const VideoProcessingContext = createContext<VideoProcessingContextType | null>(null);

export const VideoProcessingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const settings = useSettings();
  const videoState = useVideoState();
  const ttsPipeline = useTTSPipeline(
    videoState.subtitleFile,
    videoState.videoFile,
    videoState.duration,
    videoState.setVideoPlaybackRate
  );

  const blurDetection = useBlurDetection(
    videoState.containerRef,
    videoState.videoElementRef,
    videoState.previewCanvasRef,
    videoState.blurBoxRef,
    videoState.logoImgRef
  );

  const videoExport = useVideoExport();

  const [showPythonModal, setShowPythonModal] = React.useState(false);

  const videoRef = useRef<HTMLInputElement>(null);
  const subtitleRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const logoImageRef = useRef<HTMLImageElement | null>(null);
  const rectWidthRef = useRef<number>(1280);

  // Preload logo
  useEffect(() => {
    if (videoState.logoUrl) {
      const img = new Image();
      img.onload = () => {
        logoImageRef.current = img;
      };
      img.src = videoState.logoUrl;
    } else {
      logoImageRef.current = null;
    }
  }, [videoState.logoUrl]);

  // Audio volume sync
  useEffect(() => {
    if (videoState.videoElementRef.current) {
      if (ttsPipeline.generatedAudioUrl) {
        videoState.videoElementRef.current.volume = Math.max(0, Math.min(1, settings.originalVideoVolume / 100));
      } else {
        videoState.videoElementRef.current.volume = Math.max(0, Math.min(1, settings.originalVideoVolume / 100));
      }
    }
    if (videoState.audioElementRef.current) {
      videoState.audioElementRef.current.volume = Math.max(0, Math.min(1, settings.dubVolume / 100));
    }
  }, [settings.volume, settings.dubVolume, settings.originalVideoVolume, ttsPipeline.generatedAudioUrl, videoState.videoElementRef, videoState.audioElementRef]);

  // Playback rate sync
  useEffect(() => {
    if (videoState.videoElementRef.current) {
      videoState.videoElementRef.current.playbackRate = ttsPipeline.generatedAudioUrl ? videoState.videoPlaybackRate : 1;
    }
  }, [ttsPipeline.generatedAudioUrl, videoState.videoPlaybackRate, videoState.videoElementRef]);

  // Click outside toolbar listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        toolbarRef.current && !toolbarRef.current.contains(target) &&
        videoState.containerRef.current && !videoState.containerRef.current.contains(target)
      ) {
        settings.setActivePanel(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [settings, videoState.containerRef]);

  // 60fps render loop
  useEffect(() => {
    const canvas = videoState.previewCanvasRef.current;
    const video = videoState.videoElementRef.current;
    if (!canvas || !video) return;

    let animationFrameId: number;

    const syncCanvasDimensions = () => {
      if (videoState.previewCanvasRef.current) {
        const c = videoState.previewCanvasRef.current;
        const rect = c.getBoundingClientRect();
        if (rect.width > 0) {
          rectWidthRef.current = rect.width;
        }

        if (c.width !== 1280 || c.height !== 720) {
          c.width = 1280;
          c.height = 720;
        }
      }
    };

    syncCanvasDimensions();

    const handleResizeAndFullscreen = () => {
      syncCanvasDimensions();
      requestAnimationFrame(syncCanvasDimensions);
    };

    const fullscreenEvents = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
    fullscreenEvents.forEach(evt => document.addEventListener(evt, handleResizeAndFullscreen));
    window.addEventListener('resize', handleResizeAndFullscreen);

    let resizeObserver: ResizeObserver | null = null;
    if (videoState.containerRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => handleResizeAndFullscreen());
      resizeObserver.observe(videoState.containerRef.current);
    }

    const renderPreview = () => {
      const vw = canvas.width;
      const vh = canvas.height;

      if (vw === 0 || vh === 0) {
        animationFrameId = requestAnimationFrame(renderPreview);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animationFrameId = requestAnimationFrame(renderPreview);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const avgScale = rectWidthRef.current > 0 ? (vw / rectWidthRef.current) : 1;

      drawVideoFrame({
        ctx,
        renderVideo: video,
        currentTime: video.currentTime,
        videoWidth: vw,
        videoHeight: vh,
        zoomLevel: settings.zoomLevel,
        isMirrored: settings.isMirrored,
        blurIntensity: settings.blurIntensity,
        blurBox: blurDetection.blurBoxDragRef.current,
        showBgBar: settings.showBgBar,
        logoImg: (logoImageRef.current && logoImageRef.current.complete) ? logoImageRef.current : null,
        logoX: blurDetection.logoPosDragRef.current.x,
        logoY: blurDetection.logoPosDragRef.current.y,
        logoScale: blurDetection.logoScaleDragRef.current,
        subtitles: ttsPipeline.subtitles,
        isTextAutoCentered: settings.isTextAutoCentered,
        textX: settings.textX,
        textY: settings.textY,
        fontSize: settings.fontSize,
        strokeWidth: settings.strokeWidth,
        scaleFactor: avgScale,
        isDubbingActive: ttsPipeline.isAiVoiceActive && ttsPipeline.generatedAudioUrl !== null && ttsPipeline.dubAudioPositions.length === ttsPipeline.subtitles.length && videoState.audioElementRef.current !== null,
        dubAudioPositions: ttsPipeline.dubAudioPositions,
        audioCurrentTime: videoState.audioElementRef.current?.currentTime,
        syncCheckpoints: ttsPipeline.syncCheckpoints,
        videoPlaybackRate: videoState.videoPlaybackRate
      });

      animationFrameId = requestAnimationFrame(renderPreview);
    };

    animationFrameId = requestAnimationFrame(renderPreview);

    return () => {
      cancelAnimationFrame(animationFrameId);
      fullscreenEvents.forEach(evt => document.removeEventListener(evt, handleResizeAndFullscreen));
      window.removeEventListener('resize', handleResizeAndFullscreen);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [
    videoState.videoUrl, videoState.previewCanvasRef, videoState.videoElementRef, videoState.containerRef, videoState.audioElementRef, videoState.videoPlaybackRate,
    settings.blurIntensity, settings.fullWidthSpan, settings.autoChineseSubBlur, settings.zoomLevel, settings.isMirrored,
    ttsPipeline.subtitles, settings.isTextAutoCentered, settings.textX, settings.textY, settings.fontSize, settings.strokeWidth,
    videoState.logoUrl, settings.logoX, settings.logoY, settings.logoScale, settings.showBgBar,
    ttsPipeline.isAiVoiceActive, ttsPipeline.generatedAudioUrl, ttsPipeline.dubAudioPositions, ttsPipeline.syncCheckpoints, blurDetection
  ]);

  const handleFullscreen = () => {
    if (videoState.containerRef.current) {
      if (!document.fullscreenElement) {
        videoState.containerRef.current.requestFullscreen().catch(err => {
          console.error(`Error attempting to enable fullscreen: ${err.message}`);
        });
      } else {
        document.exitFullscreen();
      }
    }
  };

  const handleFileChange = (setter: React.Dispatch<React.SetStateAction<File | null>>) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setter(e.target.files[0]);
      if (setter === videoState.setVideoFile) {
        ttsPipeline.setGeneratedAudioUrl(null);
      }
    }
  };

  const handleProcess = () => {
    videoExport.startExport({
      videoFile: videoState.videoFile,
      videoUrl: videoState.videoUrl,
      generatedAudioUrl: ttsPipeline.generatedAudioUrl,
      videoPlaybackRate: videoState.videoPlaybackRate,
      zoomLevel: settings.zoomLevel,
      isMirrored: settings.isMirrored,
      blurIntensity: settings.blurIntensity,
      blurBox: settings.blurBox,
      showBgBar: settings.showBgBar,
      logoUrl: videoState.logoUrl,
      logoX: settings.logoX,
      logoY: settings.logoY,
      logoScale: settings.logoScale,
      subtitles: ttsPipeline.subtitles,
      isTextAutoCentered: settings.isTextAutoCentered,
      textX: settings.textX,
      textY: settings.textY,
      fontSize: settings.fontSize,
      strokeWidth: settings.strokeWidth,
      volume: settings.volume,
      dubVolume: settings.dubVolume,
      originalVideoVolume: settings.originalVideoVolume,
      containerWidth: videoState.containerRef.current?.clientWidth || 800,
      syncCheckpoints: ttsPipeline.syncCheckpoints,
      dubAudioPositions: ttsPipeline.dubAudioPositions
    });
  };

  return (
    <VideoProcessingContext.Provider
      value={{
        ...videoState,
        ...ttsPipeline,
        ...blurDetection,
        ...videoExport,
        showPythonModal,
        setShowPythonModal,
        handleFullscreen,
        handleFileChange,
        handleProcess,
        videoRef,
        subtitleRef,
        logoRef,
        toolbarRef
      }}
    >
      {children}
    </VideoProcessingContext.Provider>
  );
};

export const useVideoProcessing = () => {
  const context = useContext(VideoProcessingContext);
  if (!context) {
    throw new Error('useVideoProcessing must be used within a VideoProcessingProvider');
  }
  return context;
};
