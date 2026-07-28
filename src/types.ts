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
