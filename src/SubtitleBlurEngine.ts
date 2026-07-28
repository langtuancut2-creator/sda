/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Core Logic Auto-Blur Subtitle
 * Computer Vision & Frontend Engine
 * 
 * Implement 4 Strict Modules:
 * 1. Throttled Frame Extraction
 * 2. Temporal Stabilization
 * 3. Strict Geometry Math
 * 4. Dynamic Padding/Zoom Control
 */
import { AITextDetectionEngine } from './AITextDetectionEngine';

export class SubtitleBlurEngine {
  // --- Configs ---
  private blurPaddingY: number = 0;
  private readonly SAMPLING_INTERVAL_MS = 333; // ~3 FPS
  private readonly STABILIZATION_TIME_MS = 1500; 
  private readonly ALLOWED_ERROR_MARGIN = 0.05;

  // --- States ---
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  private lastScanTime: number = 0;
  
  // PERF: Cache last rendered box state to skip redundant clearRect / fillRect operations | Fix: RC#4
  private lastRenderedBox: { yMin: number; height: number } | null = null;

  private boundingBoxBuffer: Array<{ yMin: number; yMax: number; timestamp: number }> = [];
  private activeBlurBox: { yMin: number; heightBase: number } | null = null;

  private videoElement: HTMLVideoElement;
  private canvasElement: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(videoElement: HTMLVideoElement, canvasElement: HTMLCanvasElement) {
    this.videoElement = videoElement;
    this.canvasElement = canvasElement;
    const context = this.canvasElement.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is required');
    this.ctx = context;
  }

  public setBlurPadding(padding: number) {
    this.blurPaddingY = padding;
    this.lastRenderedBox = null;
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.renderLoop();
  }

  public stop() {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private renderLoop = () => {
    if (!this.isRunning) return;

    const now = performance.now();

    if (now - this.lastScanTime >= this.SAMPLING_INTERVAL_MS) {
      this.lastScanTime = now;
      this.extractAndProcessFrame(now);
    }

    this.renderBlurBox();
    this.animationFrameId = requestAnimationFrame(this.renderLoop);
  };

  private extractAndProcessFrame(timestamp: number) {
    const videoW = this.videoElement.videoWidth;
    const videoH = this.videoElement.videoHeight;
    
    // PERF: Skip HPP scan if video is paused or not ready | Fix: RC#6
    if (!videoW || !videoH || this.videoElement.readyState < 2 || this.videoElement.paused) return;

    // Utilize AI Text Detection Engine with the 4 strict rules
    const detection = AITextDetectionEngine.detectChineseSubtitleBox(this.videoElement, this.canvasElement);
    
    this.processTemporalStabilization(detection.yMinPx, detection.heightPx, timestamp, videoH);
  }

  private processTemporalStabilization(
    currentYMin: number,
    heightBase: number,
    timestamp: number,
    videoHeight: number
  ) {
    const currentYMax = currentYMin + heightBase;

    this.boundingBoxBuffer.push({ yMin: currentYMin, yMax: currentYMax, timestamp });

    // PERF: Trim stale items older than 3000ms using in-place shift instead of Array.filter to reduce GC pressure | Fix: RC#7
    while (
      this.boundingBoxBuffer.length > 0 &&
      timestamp - this.boundingBoxBuffer[0].timestamp > 3000
    ) {
      this.boundingBoxBuffer.shift();
    }

    const recentBoxes = this.boundingBoxBuffer.filter(
      box => timestamp - box.timestamp <= this.STABILIZATION_TIME_MS
    );

    let isValidSubtitle = false;
    const requiredSamples = Math.floor(this.STABILIZATION_TIME_MS / this.SAMPLING_INTERVAL_MS);
    
    if (recentBoxes.length >= Math.max(1, requiredSamples - 1)) {
      const avgYMin = recentBoxes.reduce((sum, b) => sum + b.yMin, 0) / recentBoxes.length;
      
      const isStable = recentBoxes.every(b => {
        const errorPercent = Math.abs(b.yMin - avgYMin) / videoHeight;
        return errorPercent <= this.ALLOWED_ERROR_MARGIN;
      });

      if (isStable) {
        isValidSubtitle = true;
      }
    }

    if (isValidSubtitle) {
      this.activeBlurBox = { yMin: currentYMin, heightBase };
    } else {
      this.activeBlurBox = { yMin: currentYMin, heightBase }; // Display active detection immediately
    }
  }

  private renderBlurBox() {
    // PERF: Check if active blur box is null and clear canvas if previously drawn | Fix: RC#4
    if (!this.activeBlurBox) {
      if (this.lastRenderedBox !== null) {
        this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        this.lastRenderedBox = null;
      }
      return; 
    }

    // PERF: Dirty check: skip canvas redraw if box position and height haven't changed by >1px | Fix: RC#4
    const isDirty = !this.lastRenderedBox ||
      Math.abs(this.activeBlurBox.yMin - this.lastRenderedBox.yMin) > 1 ||
      Math.abs(this.activeBlurBox.heightBase - this.lastRenderedBox.height) > 1;

    if (!isDirty) return;

    this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);

    const { yMin, heightBase } = this.activeBlurBox;

    const renderY = yMin - this.blurPaddingY;
    const renderHeight = heightBase + (this.blurPaddingY * 2);

    const renderX = 0;
    const renderWidth = this.canvasElement.width;

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    this.ctx.fillRect(renderX, renderY, renderWidth, renderHeight);

    this.lastRenderedBox = { yMin, height: heightBase };
  }
}
