export interface ExportSettings {
  quality: 'fast' | 'balanced' | 'high' | 'highest';
  fps: 30 | 24;
  resolution: '720p' | '1080p' | '4K';
  videoBitrate: string;
  audioBitrate: string;
}

export interface ExportMetadata {
  videoDuration: number;
  totalFrames: number;
  audioSampleRate: number;
  videoWidth: number;
  videoHeight: number;
}

export interface ExportProgress {
  status: 'preparing' | 'rendering' | 'encoding' | 'finalizing' | 'complete' | 'error';
  progress: number; // 0-100
  currentFrame?: number;
  totalFrames?: number;
  message: string;
}

export interface FrameSyncPoint {
  frameIndex: number;
  videoTime: number;
  audioStartSample: number;
  audioEndSample: number;
  audioStartMs: number;
  audioEndMs: number;
}
