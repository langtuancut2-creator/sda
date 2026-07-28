import type { VoiceConfig } from './VietnamVoiceOptimizationEngine';
import type { SyncCheckpoint } from './DubbingAudioEngine';

export interface SubtitleItem {
  start: number;
  end: number;
  text: string;
}

export interface BlurBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ActivePanel = 'blur' | 'text' | 'logo' | 'zoom' | 'mirror' | 'volume' | null;

export interface ExportOptions {
  videoFile: File | null;
  videoUrl: string | null;
  generatedAudioUrl: string | null;
  videoPlaybackRate: number;
  zoomLevel: number;
  isMirrored: boolean;
  blurIntensity: number;
  blurBox: BlurBox;
  showBgBar: boolean;
  logoUrl: string | null;
  logoX: number;
  logoY: number;
  logoScale: number;
  subtitles: SubtitleItem[];
  isTextAutoCentered: boolean;
  textX: number;
  textY: number;
  fontSize: number;
  strokeWidth: number;
  volume: number;
  dubVolume: number;
  originalVideoVolume: number;
  containerWidth: number;
  syncCheckpoints: SyncCheckpoint[];
  dubAudioPositions: number[];
  isAborted: () => boolean;
}
