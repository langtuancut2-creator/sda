import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { BlurBox } from '../types';
import { AITextDetectionEngine } from '../AITextDetectionEngine';
import { useSettings } from '../contexts/SettingsContext';

export const useBlurDetection = (
  containerRef: React.RefObject<HTMLDivElement | null>,
  videoElementRef: React.RefObject<HTMLVideoElement | null>,
  previewCanvasRef: React.RefObject<HTMLCanvasElement | null>,
  blurBoxRef: React.RefObject<HTMLDivElement | null>,
  logoImgRef: React.RefObject<HTMLDivElement | null>
) => {
  const {
    blurBox, setBlurBox,
    logoX, setLogoX,
    logoY, setLogoY,
    logoScale, setLogoScale,
    isEditing,
    setShowGuideH, setShowGuideV,
    setFullWidthSpan, setBlurIntensity
  } = useSettings();

  const [isScanningSub, setIsScanningSub] = useState(false);
  const [isForceScanning, setIsForceScanning] = useState(false);
  const [scanStatusMsg, setScanStatusMsg] = useState('');

  const isDragging = useRef<'none' | 'blur' | 'logo' | 'blur-resize' | 'logo-resize'>('none');
  const dragStart = useRef({ x: 0, y: 0, elX: 0, elY: 0, startW: 0, startH: 0 });

  const blurBoxDragRef = useRef(blurBox);
  const logoPosDragRef = useRef({ x: logoX, y: logoY });
  const logoScaleDragRef = useRef(logoScale);
  const guidesDragRef = useRef({ h: false, v: false });

  useEffect(() => {
    blurBoxDragRef.current = blurBox;
  }, [blurBox]);

  useEffect(() => {
    logoPosDragRef.current = { x: logoX, y: logoY };
  }, [logoX, logoY]);

  useEffect(() => {
    logoScaleDragRef.current = logoScale;
  }, [logoScale]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const target = isDragging.current;
      if (target === 'none' || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const SNAP_TOLERANCE = 8;
      const centerX = containerRect.width / 2;
      const centerY = containerRect.height / 2;
      let snappedV = false;
      let snappedH = false;

      if (target === 'blur-resize' && blurBoxRef.current) {
        let newW = dragStart.current.startW + (e.clientX - dragStart.current.x);
        let newH = dragStart.current.startH + (e.clientY - dragStart.current.y);

        if (newW < 20) newW = 20;
        if (newH < 20) newH = 20;

        const currentX = dragStart.current.elX;
        const currentY = dragStart.current.elY;

        if (Math.abs(currentX + newW / 2 - centerX) < SNAP_TOLERANCE) {
          newW = (centerX - currentX) * 2;
          snappedV = true;
        }

        if (Math.abs(currentY + newH / 2 - centerY) < SNAP_TOLERANCE) {
          newH = (centerY - currentY) * 2;
          snappedH = true;
        }

        if (currentX + newW > containerRect.width) newW = containerRect.width - currentX;
        if (currentY + newH > containerRect.height) newH = containerRect.height - currentY;

        const heightPercent = (newH / containerRect.height) * 100;

        blurBoxDragRef.current = { ...blurBoxDragRef.current, w: 100, h: heightPercent, x: 0 };
        guidesDragRef.current = { h: snappedH, v: snappedV };
        if (blurBoxRef.current) {
          blurBoxRef.current.style.height = `${heightPercent}%`;
        }
        return;
      }

      if (target === 'logo-resize' && logoImgRef.current) {
        let newW = dragStart.current.startW + (e.clientX - dragStart.current.x);
        if (newW < 20) newW = 20;

        const maxW = containerRect.width;
        if (newW > maxW) newW = maxW;

        const widthPercent = (newW / containerRect.width) * 100;

        logoScaleDragRef.current = widthPercent;
        if (logoImgRef.current) {
          logoImgRef.current.style.width = `${widthPercent}%`;
        }
        return;
      }

      let newX = dragStart.current.elX + (e.clientX - dragStart.current.x);
      let newY = dragStart.current.elY + (e.clientY - dragStart.current.y);

      const elW = target === 'blur' ? (blurBoxRef.current?.offsetWidth || 0) : (logoImgRef.current?.getBoundingClientRect().width || 0);
      const elH = target === 'blur' ? (blurBoxRef.current?.offsetHeight || 0) : (logoImgRef.current?.getBoundingClientRect().height || 0);

      let itemCenterX = target === 'blur' ? newX + elW / 2 : newX;
      let itemCenterY = target === 'blur' ? newY + elH / 2 : newY;

      if (Math.abs(itemCenterX - centerX) < SNAP_TOLERANCE) {
        itemCenterX = centerX;
        snappedV = true;
      }

      if (Math.abs(itemCenterY - centerY) < SNAP_TOLERANCE) {
        itemCenterY = centerY;
        snappedH = true;
      }

      if (target === 'blur') {
        newX = itemCenterX - elW / 2;
        newY = itemCenterY - elH / 2;
        if (newX < 0) newX = 0;
        if (newY < 0) newY = 0;
        if (newX + elW > containerRect.width) newX = containerRect.width - elW;
        if (newY + elH > containerRect.height) newY = containerRect.height - elH;
      } else {
        newX = itemCenterX;
        newY = itemCenterY;
        if (newX - elW / 2 < 0) newX = elW / 2;
        if (newY - elH / 2 < 0) newY = elH / 2;
        if (newX + elW / 2 > containerRect.width) newX = containerRect.width - elW / 2;
        if (newY + elH / 2 > containerRect.height) newY = containerRect.height - elH / 2;
      }

      const leftPercent = (newX / containerRect.width) * 100;
      const topPercent = (newY / containerRect.height) * 100;

      guidesDragRef.current = { h: snappedH, v: snappedV };
      if (target === 'blur') {
        blurBoxDragRef.current = { ...blurBoxDragRef.current, x: 0, y: topPercent, w: 100 };
        if (blurBoxRef.current) {
          blurBoxRef.current.style.top = `${topPercent}%`;
        }
      } else {
        logoPosDragRef.current = { x: leftPercent, y: topPercent };
        if (logoImgRef.current) {
          logoImgRef.current.style.left = `${leftPercent}%`;
          logoImgRef.current.style.top = `${topPercent}%`;
        }
      }
    };

    const handleMouseUp = () => {
      if (isDragging.current !== 'none') {
        setBlurBox({ ...blurBoxDragRef.current });
        setLogoX(logoPosDragRef.current.x);
        setLogoY(logoPosDragRef.current.y);
        setLogoScale(logoScaleDragRef.current);
        setShowGuideV(guidesDragRef.current.v);
        setShowGuideH(guidesDragRef.current.h);
        isDragging.current = 'none';
      }
      setShowGuideV(false);
      setShowGuideH(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [containerRef, blurBoxRef, logoImgRef, setBlurBox, setLogoX, setLogoY, setLogoScale, setShowGuideV, setShowGuideH]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement | HTMLImageElement>, target: 'blur' | 'logo') => {
    if (!isEditing) return;

    if (target === 'blur' && blurBoxRef.current) {
      if ((e.target as HTMLElement).closest('.resize-handle')) {
        isDragging.current = 'blur-resize';
        const containerRect = containerRef.current?.getBoundingClientRect();
        dragStart.current = {
          x: e.clientX,
          y: e.clientY,
          elX: (blurBox.x / 100) * (containerRect?.width || 0),
          elY: (blurBox.y / 100) * (containerRect?.height || 0),
          startW: blurBoxRef.current.offsetWidth,
          startH: blurBoxRef.current.offsetHeight
        };
        return;
      }
    }

    if (target === 'logo' && logoImgRef.current) {
      if ((e.target as HTMLElement).closest('.logo-resize-handle')) {
        isDragging.current = 'logo-resize';
        dragStart.current = {
          x: e.clientX,
          y: e.clientY,
          elX: 0,
          elY: 0,
          startW: logoImgRef.current.offsetWidth,
          startH: logoImgRef.current.offsetHeight
        };
        return;
      }
    }

    isDragging.current = target;

    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    const currentXPercent = target === 'blur' ? blurBox.x : logoX;
    const currentYPercent = target === 'blur' ? blurBox.y : logoY;

    const boxLeftPx = (currentXPercent / 100) * containerRect.width;
    const boxTopPx = (currentYPercent / 100) * containerRect.height;

    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      elX: boxLeftPx,
      elY: boxTopPx,
      startW: 0,
      startH: 0
    };
  }, [isEditing, containerRef, blurBoxRef, logoImgRef, blurBox, logoX, logoY]);

  const detectAndFitChineseSubtitles = useCallback(async () => {
    if (!videoElementRef.current || !containerRef.current) {
      alert('Vui lòng chọn video trước ở mục 1!');
      return;
    }

    setIsScanningSub(true);
    try {
      setScanStatusMsg('📸 Bước 1/3: Chụp ảnh frame hiện tại từ video (Snapshot)...');
      await new Promise(r => setTimeout(r, 200));

      setScanStatusMsg('🤖 Bước 2/3: Gửi payload ảnh đến Gemini API (mô hình gemini-3.6-flash, vùng 80%-100%)...');

      const videoEl = videoElementRef.current;
      const result = await AITextDetectionEngine.detectChineseSubtitleBoxWithGemini(
        videoEl,
        previewCanvasRef.current
      );

      setBlurBox({
        x: 0,
        y: result.y,
        w: 100,
        h: result.height
      });
      setFullWidthSpan(true);
      setBlurIntensity(16);
      setScanStatusMsg(result.statusMessage);
    } catch (e: any) {
      console.warn('Lỗi nhận diện phụ đề qua Gemini API:', e);
      setBlurBox({ x: 0, y: 83, w: 100, h: 14 });
      setBlurIntensity(16);
      setScanStatusMsg('🛡️ Đã kích hoạt vùng che mờ mặc định an toàn (Y: 83%, Cao: 14%, Blur: 16px).');
    } finally {
      setIsScanningSub(false);
    }
  }, [videoElementRef, containerRef, previewCanvasRef, setBlurBox, setFullWidthSpan, setBlurIntensity]);

  const forceScanChineseSubtitles = useCallback(async () => {
    if (!videoElementRef.current || !containerRef.current) {
      alert('Vui lòng chọn video trước ở mục 1!');
      return;
    }

    setIsForceScanning(true);
    setScanStatusMsg('⚡ Đang thực hiện Gemini AI Deep Scan...');

    try {
      const videoEl = videoElementRef.current;
      const result = await AITextDetectionEngine.detectChineseSubtitleBoxWithGemini(
        videoEl,
        previewCanvasRef.current
      );

      setBlurBox({
        x: 0,
        y: result.y,
        w: 100,
        h: result.height
      });
      setFullWidthSpan(true);
      setBlurIntensity(16);
      setScanStatusMsg(`⚡ Gemini AI Deep Scan hoàn tất: Y=${result.y}%, Cao=${result.height}% (Đã làm mờ 16px)`);
    } catch (e) {
      console.warn('Lỗi quét phụ đề:', e);
      setScanStatusMsg('❌ Lỗi khi thực hiện quét Gemini AI.');
    } finally {
      setIsForceScanning(false);
    }
  }, [videoElementRef, containerRef, previewCanvasRef, setBlurBox, setFullWidthSpan, setBlurIntensity]);

  const handleAlignLogo = useCallback((position: 'top-left' | 'top-right') => {
    const halfW = logoScale / 2;
    let halfH = 5;

    let aspect = 0.5;
    const imgEl = logoImgRef.current?.querySelector('img') as HTMLImageElement | null;
    if (imgEl && imgEl.naturalWidth && imgEl.naturalHeight) {
      aspect = imgEl.naturalHeight / imgEl.naturalWidth;
    }

    let videoW = 1280;
    let videoH = 720;
    if (videoElementRef.current && videoElementRef.current.videoWidth && videoElementRef.current.videoHeight) {
      videoW = videoElementRef.current.videoWidth;
      videoH = videoElementRef.current.videoHeight;
    } else if (containerRef.current && containerRef.current.clientWidth && containerRef.current.clientHeight) {
      videoW = containerRef.current.clientWidth;
      videoH = containerRef.current.clientHeight;
    }

    const logoWInPx = (logoScale / 100) * videoW;
    const logoHInPx = logoWInPx * aspect;
    halfH = ((logoHInPx / videoH) * 100) / 2;

    const targetX = position === 'top-left' ? halfW : (100 - halfW);

    setLogoX(Number(targetX.toFixed(1)));
    setLogoY(Number(halfH.toFixed(1)));
  }, [logoScale, logoImgRef, videoElementRef, containerRef, setLogoX, setLogoY]);

  return {
    blurBoxDragRef,
    logoPosDragRef,
    logoScaleDragRef,
    isScanningSub,
    isForceScanning,
    scanStatusMsg,
    handleMouseDown,
    detectAndFitChineseSubtitles,
    forceScanChineseSubtitles,
    handleAlignLogo
  };
};
