import { Input, ALL_FORMATS, BlobSource, CanvasSink } from 'mediabunny';
import { drawVideoFrame, type GraphicsFrameParams } from '../VideoFrameRenderer';
import { videoTimeToAudioTime, SyncCheckpoint } from '../DubbingAudioEngine';

export interface SegmentJob {
  segmentIndex: number;
  videoBlob: Blob;
  startTime: number;
  endTime: number;
  fps: number;
  vw: number;
  vh: number;
  scaleFactor: number;
  logoBitmap: ImageBitmap | null;
  codec: string;
  bitrate: number;
  renderOptions: {
    zoomLevel: number;
    isMirrored: boolean;
    blurIntensity: number;
    blurBox: { x: number; y: number; w: number; h: number };
    showBgBar: boolean;
    logoX: number;
    logoY: number;
    logoScale: number;
    subtitles: Array<{ start: number; end: number; text: string }>;
    isTextAutoCentered: boolean;
    textX: number;
    textY: number;
    fontSize: number;
    strokeWidth: number;
    syncCheckpoints?: SyncCheckpoint[];
    dubAudioPositions?: number[];
    videoPlaybackRate?: number;
    isDubbingActive?: boolean;
  };
}

self.onmessage = async (e: MessageEvent<SegmentJob>) => {
  const {
    segmentIndex,
    videoBlob,
    startTime,
    endTime,
    fps,
    vw,
    vh,
    scaleFactor,
    logoBitmap,
    codec,
    bitrate,
    renderOptions
  } = e.data;

  let encoder: VideoEncoder | null = null;

  try {
    const canvas = new OffscreenCanvas(vw, vh);
    const ctx = canvas.getContext('2d', { alpha: false }) as OffscreenCanvasRenderingContext2D;

    encoder = new VideoEncoder({
      output: (chunk, metadata) => {
        const data = new ArrayBuffer(chunk.byteLength);
        chunk.copyTo(data);
        (self as unknown as Worker).postMessage(
          {
            type: 'chunk',
            segmentIndex,
            timestamp: chunk.timestamp,
            duration: chunk.duration,
            isKey: chunk.type === 'key',
            data
          },
          [data]
        );

        if (metadata?.decoderConfig?.codec) {
          (self as unknown as Worker).postMessage({
            type: 'trackConfig',
            codec: metadata.decoderConfig.codec,
            description: metadata.decoderConfig.description
          });
        }
      },
      error: (err) => {
        (self as unknown as Worker).postMessage({
          type: 'error',
          segmentIndex,
          message: 'Lỗi VideoEncoder: ' + (err?.message || String(err))
        });
      }
    });

    encoder.configure({
      codec,
      width: vw,
      height: vh,
      bitrate,
      framerate: fps,
      hardwareAcceleration: 'prefer-hardware'
    });

    const input = new Input({
      source: new BlobSource(videoBlob),
      formats: ALL_FORMATS
    });

    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) {
      throw new Error('Không tìm thấy luồng video trong file gốc');
    }

    const canvasSink = new CanvasSink(videoTrack, {
      width: vw,
      height: vh,
      decoderOptions: { hardwareAcceleration: 'prefer-hardware' }
    });

    let frameIndex = 0;
    const frameDurationUs = Math.round(1_000_000 / fps);

    for await (const wrapped of canvasSink.canvases(startTime, endTime)) {
      const tAudio = wrapped.timestamp;
      const tVideo = renderOptions.isDubbingActive
        ? videoTimeToAudioTime(
            tAudio,
            renderOptions.syncCheckpoints || [],
            renderOptions.videoPlaybackRate || 1
          )
        : tAudio;

      const frameParams: GraphicsFrameParams = {
        ctx,
        renderVideo: wrapped.canvas,
        currentTime: tVideo,
        videoWidth: vw,
        videoHeight: vh,
        zoomLevel: renderOptions.zoomLevel,
        isMirrored: renderOptions.isMirrored,
        blurIntensity: renderOptions.blurIntensity,
        blurBox: renderOptions.blurBox,
        showBgBar: renderOptions.showBgBar,
        logoImg: logoBitmap,
        logoX: renderOptions.logoX,
        logoY: renderOptions.logoY,
        logoScale: renderOptions.logoScale,
        subtitles: renderOptions.subtitles,
        isTextAutoCentered: renderOptions.isTextAutoCentered,
        textX: renderOptions.textX,
        textY: renderOptions.textY,
        fontSize: renderOptions.fontSize,
        strokeWidth: renderOptions.strokeWidth,
        scaleFactor,
        syncCheckpoints: renderOptions.syncCheckpoints,
        dubAudioPositions: renderOptions.dubAudioPositions,
        videoPlaybackRate: renderOptions.videoPlaybackRate,
        isDubbingActive: renderOptions.isDubbingActive,
        audioCurrentTime: tAudio
      };

      drawVideoFrame(frameParams);

      const timestampMicros = Math.round(tAudio * 1_000_000);
      const videoFrame = new VideoFrame(canvas, {
        timestamp: timestampMicros,
        duration: frameDurationUs
      });

      const isKeyFrame = frameIndex === 0 || frameIndex % (fps * 2) === 0;
      encoder.encode(videoFrame, { keyFrame: isKeyFrame });
      videoFrame.close();

      frameIndex++;
      if (frameIndex % 10 === 0) {
        (self as unknown as Worker).postMessage({
          type: 'progress',
          segmentIndex,
          framesDone: frameIndex
        });
      }
    }

    await encoder.flush();
    encoder.close();

    (self as unknown as Worker).postMessage({
      type: 'done',
      segmentIndex,
      totalFrames: frameIndex
    });
  } catch (err: unknown) {
    const error = err as Error;
    (self as unknown as Worker).postMessage({
      type: 'error',
      segmentIndex,
      message: error.message || String(error)
    });
  }
};
