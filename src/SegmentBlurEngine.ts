/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AITextDetectionEngine } from './AITextDetectionEngine';

export interface SubtitleSegment {
  start: number;
  end: number;
  text: string;
}

export interface LockedBlurBox {
  start: number;
  end: number;
  yMin: number;
  heightBase: number;
}

export class SegmentBlurEngine {
  private lockedSegments: LockedBlurBox[] = [];
  private videoElement: HTMLVideoElement;
  private canvasElement: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private blurPaddingY: number = 0;

  constructor(videoElement: HTMLVideoElement, canvasElement: HTMLCanvasElement) {
    this.videoElement = videoElement;
    this.canvasElement = canvasElement;
    const context = this.canvasElement.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is required');
    this.ctx = context;
  }

  public setBlurPadding(padding: number) {
    this.blurPaddingY = padding;
  }

  public async preScanSegments(subtitles: SubtitleSegment[]) {
    this.lockedSegments = [];
    
    const originalTime = this.videoElement.currentTime;
    const originalPaused = this.videoElement.paused;

    for (const sub of subtitles) {
      if (sub.end - sub.start <= 0 || !sub.text.trim()) continue;
      
      const lockedBox = await this.scanSingleSegment(sub);
      if (lockedBox) {
        this.lockedSegments.push(lockedBox);
      }
    }

    this.videoElement.currentTime = originalTime;
    if (!originalPaused) {
      await this.videoElement.play().catch(() => {});
    }
  }

  private async scanSingleSegment(sub: SubtitleSegment): Promise<LockedBlurBox | null> {
    const SAMPLES_COUNT = 5;
    const duration = sub.end - sub.start;
    const step = duration / (SAMPLES_COUNT + 1);
    
    const scannedBoxes: Array<{ yMin: number, height: number }> = [];

    for (let i = 1; i <= SAMPLES_COUNT; i++) {
      const targetTime = sub.start + (step * i);
      this.videoElement.currentTime = targetTime;
      
      await new Promise<void>(resolve => {
        const onSeeked = () => {
          this.videoElement.removeEventListener('seeked', onSeeked);
          resolve();
        };
        this.videoElement.addEventListener('seeked', onSeeked);
        setTimeout(() => {
          this.videoElement.removeEventListener('seeked', onSeeked);
          resolve();
        }, 300);
      });

      const box = this.extractFrameAndDetectv3();
      if (box) {
        scannedBoxes.push(box);
      }
    }

    if (scannedBoxes.length === 0) return null;

    const yValues = scannedBoxes.map(b => b.yMin).sort((a, b) => a - b);
    let medianY = 0;
    const mid = Math.floor(yValues.length / 2);
    if (yValues.length % 2 === 0) {
      medianY = (yValues[mid - 1] + yValues[mid]) / 2;
    } else {
      medianY = yValues[mid];
    }

    const validBoxes = scannedBoxes.filter(b => Math.abs(b.yMin - medianY) <= 20);

    if (validBoxes.length === 0) return null;

    const fixedYMin = validBoxes.reduce((sum, b) => sum + b.yMin, 0) / validBoxes.length;
    const fixedHeight = validBoxes.reduce((sum, b) => sum + b.height, 0) / validBoxes.length;

    return {
      start: sub.start,
      end: sub.end,
      yMin: fixedYMin,
      heightBase: fixedHeight
    };
  }

  private extractFrameAndDetectv3(): { yMin: number, height: number } | null {
    if (this.videoElement.readyState < 2) return null;
    const detection = AITextDetectionEngine.detectChineseSubtitleBox(this.videoElement, this.canvasElement);
    return {
      yMin: detection.yMinPx,
      height: detection.heightPx
    };
  }

  public overrideSegmentCoordinates(currentTime: number, newYMin: number, newHeight: number) {
    const segmentIndex = this.lockedSegments.findIndex(
      seg => currentTime >= seg.start && currentTime <= seg.end
    );

    if (segmentIndex !== -1) {
      this.lockedSegments[segmentIndex].yMin = newYMin;
      this.lockedSegments[segmentIndex].heightBase = newHeight;
    }
  }

  public renderBlurBox(currentTime: number) {
    this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);

    const activeLock = this.lockedSegments.find(
      seg => currentTime >= seg.start && currentTime <= seg.end
    );

    if (activeLock) {
      const renderY = activeLock.yMin - this.blurPaddingY;
      const renderHeight = activeLock.heightBase + (this.blurPaddingY * 2);
      
      const renderX = 0;
      const renderWidth = this.canvasElement.width;

      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      this.ctx.fillRect(renderX, renderY, renderWidth, renderHeight);
    }
  }
}
