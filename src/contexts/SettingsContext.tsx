import React, { createContext, useContext, useState } from 'react';
import type { BlurBox, ActivePanel } from '../types';

interface SettingsContextType {
  activePanel: ActivePanel;
  setActivePanel: React.Dispatch<React.SetStateAction<ActivePanel>>;
  blurIntensity: number;
  setBlurIntensity: React.Dispatch<React.SetStateAction<number>>;
  blurBox: BlurBox;
  setBlurBox: React.Dispatch<React.SetStateAction<BlurBox>>;
  fontSize: number;
  setFontSize: React.Dispatch<React.SetStateAction<number>>;
  strokeWidth: number;
  setStrokeWidth: React.Dispatch<React.SetStateAction<number>>;
  textX: number;
  setTextX: React.Dispatch<React.SetStateAction<number>>;
  textY: number;
  setTextY: React.Dispatch<React.SetStateAction<number>>;
  logoScale: number;
  setLogoScale: React.Dispatch<React.SetStateAction<number>>;
  logoX: number;
  setLogoX: React.Dispatch<React.SetStateAction<number>>;
  logoY: number;
  setLogoY: React.Dispatch<React.SetStateAction<number>>;
  zoomLevel: number;
  setZoomLevel: React.Dispatch<React.SetStateAction<number>>;
  isMirrored: boolean;
  setIsMirrored: React.Dispatch<React.SetStateAction<boolean>>;
  dubbingVolume: number;
  setDubbingVolume: React.Dispatch<React.SetStateAction<number>>;
  originalVideoVolume: number;
  setOriginalVideoVolume: React.Dispatch<React.SetStateAction<number>>;
  isTextAutoCentered: boolean;
  setIsTextAutoCentered: React.Dispatch<React.SetStateAction<boolean>>;
  isEditing: boolean;
  setIsEditing: React.Dispatch<React.SetStateAction<boolean>>;
  showTimeline: boolean;
  setShowTimeline: React.Dispatch<React.SetStateAction<boolean>>;
  showGuideH: boolean;
  setShowGuideH: React.Dispatch<React.SetStateAction<boolean>>;
  showGuideV: boolean;
  setShowGuideV: React.Dispatch<React.SetStateAction<boolean>>;
  showBgBar: boolean;
  setShowBgBar: React.Dispatch<React.SetStateAction<boolean>>;
  autoChineseSubBlur: boolean;
  setAutoChineseSubBlur: React.Dispatch<React.SetStateAction<boolean>>;
  fullWidthSpan: boolean;
  setFullWidthSpan: React.Dispatch<React.SetStateAction<boolean>>;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [blurIntensity, setBlurIntensity] = useState(20);
  const [blurBox, setBlurBox] = useState<BlurBox>({ x: 0, y: 83, w: 100, h: 14 });
  const [fontSize, setFontSize] = useState(36);
  const [strokeWidth, setStrokeWidth] = useState(25);
  const [textX, setTextX] = useState(50);
  const [textY, setTextY] = useState(85);
  const [logoScale, setLogoScale] = useState(25);
  const [logoX, setLogoX] = useState(50);
  const [logoY, setLogoY] = useState(50);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [isMirrored, setIsMirrored] = useState(false);
  const [dubbingVolume, setDubbingVolume] = useState(100);
  const [originalVideoVolume, setOriginalVideoVolume] = useState(100);
  const [isTextAutoCentered, setIsTextAutoCentered] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showGuideH, setShowGuideH] = useState(false);
  const [showGuideV, setShowGuideV] = useState(false);
  const [showBgBar, setShowBgBar] = useState(false);
  const [autoChineseSubBlur, setAutoChineseSubBlur] = useState(true);
  const [fullWidthSpan, setFullWidthSpan] = useState(true);

  return (
    <SettingsContext.Provider
      value={{
        activePanel, setActivePanel,
        blurIntensity, setBlurIntensity,
        blurBox, setBlurBox,
        fontSize, setFontSize,
        strokeWidth, setStrokeWidth,
        textX, setTextX,
        textY, setTextY,
        logoScale, setLogoScale,
        logoX, setLogoX,
        logoY, setLogoY,
        zoomLevel, setZoomLevel,
        isMirrored, setIsMirrored,
        dubbingVolume, setDubbingVolume,
        originalVideoVolume, setOriginalVideoVolume,
        isTextAutoCentered, setIsTextAutoCentered,
        isEditing, setIsEditing,
        showTimeline, setShowTimeline,
        showGuideH, setShowGuideH,
        showGuideV, setShowGuideV,
        showBgBar, setShowBgBar,
        autoChineseSubBlur, setAutoChineseSubBlur,
        fullWidthSpan, setFullWidthSpan
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
