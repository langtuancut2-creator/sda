import { drawGraphicsFrame, GraphicsFrameParams } from '../VideoRenderer';

export interface FrameExtractionSettings {
  video: HTMLVideoElement;
  duration: number;
  width: number;
  height: number;
  fps: number;
  graphicsParams: Omit<GraphicsFrameParams, 'ctx' | 'renderVideo' | 'currentTime' | 'videoWidth' | 'videoHeight' | 'scaleFactor'>;
}

export function useFrameExtraction() {
  const extractFrames = async (
    settings: FrameExtractionSettings,
    onProgress?: (frameIndex: number, totalFrames: number, percent: number) => void
  ): Promise<string[]> => {
    const { video, duration, width, height, fps, graphicsParams } = settings;
    const totalFrames = Math.floor(duration * fps);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Canvas 2D Context not supported');
    }

    const scaleFactor = width / 1920;
    const framesBase64: string[] = [];

    // Helper to seek video to specific timestamp and wait for frame render
    const seekToTime = (time: number): Promise<void> => {
      return new Promise((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
        video.currentTime = time;
      });
    };

    const originalTime = video.currentTime;
    const originalPaused = video.paused;
    if (!originalPaused) {
      video.pause();
    }

    try {
      for (let i = 0; i < totalFrames; i++) {
        const frameTime = i / fps;
        await seekToTime(frameTime);

        // Draw current frame using graphics renderer
        drawGraphicsFrame({
          ...graphicsParams,
          ctx,
          renderVideo: video,
          currentTime: frameTime,
          videoWidth: width,
          videoHeight: height,
          scaleFactor
        });

        // Convert canvas to jpeg base64 frame data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        framesBase64.push(dataUrl);

        if (onProgress) {
          const percent = Math.round(((i + 1) / totalFrames) * 100);
          onProgress(i + 1, totalFrames, percent);
        }
      }
    } finally {
      // Restore video state
      video.currentTime = originalTime;
      if (!originalPaused) {
        video.play().catch(() => {});
      }
    }

    return framesBase64;
  };

  return { extractFrames };
}
