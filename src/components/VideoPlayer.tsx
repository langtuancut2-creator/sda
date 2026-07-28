import React, { useEffect } from 'react';
import {
  Pen,
  Eye,
  RotateCcw,
  RotateCw,
  Droplet,
  Type,
  Image as ImageIcon,
  ZoomIn,
  FlipHorizontal,
  Volume2,
  Maximize,
  Scan,
  Loader2,
  AlignCenter,
  Mic,
  Film
} from 'lucide-react';
import { useVideoProcessing } from '../contexts/VideoProcessingContext';
import { useSettings } from '../contexts/SettingsContext';
import { videoTimeToAudioTime } from '../DubbingAudioEngine';

export const VideoPlayer: React.FC = () => {
  const {
    videoUrl,
    generatedAudioUrl,
    videoPlaybackRate,
    syncCheckpoints,
    videoProgress,
    videoElementRef,
    audioElementRef,
    previewCanvasRef,
    containerRef,
    blurBoxRef,
    logoImgRef,
    toolbarRef,
    handleTimeUpdate,
    togglePlayPause,
    skipBackward,
    skipForward,
    seek,
    handleFullscreen,
    logoUrl,
    handleMouseDown,
    detectAndFitChineseSubtitles,
    forceScanChineseSubtitles,
    handleAlignLogo,
    isScanningSub,
    isForceScanning,
    scanStatusMsg
  } = useVideoProcessing();

  const {
    isEditing,
    setIsEditing,
    showTimeline,
    setShowTimeline,
    showGuideH,
    showGuideV,
    activePanel,
    setActivePanel,
    blurIntensity,
    setBlurIntensity,
    blurBox,
    setBlurBox,
    fontSize,
    setFontSize,
    strokeWidth,
    setStrokeWidth,
    textX,
    setTextX,
    textY,
    setTextY,
    logoScale,
    setLogoScale,
    logoX,
    setLogoX,
    logoY,
    setLogoY,
    zoomLevel,
    setZoomLevel,
    isMirrored,
    setIsMirrored,
    dubbingVolume,
    setDubbingVolume,
    originalVideoVolume,
    setOriginalVideoVolume,
    isTextAutoCentered,
    setIsTextAutoCentered,
    showBgBar
  } = useSettings();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          skipBackward(5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          skipForward(5);
          break;
        case ' ':
          e.preventDefault();
          togglePlayPause();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [skipBackward, skipForward, togglePlayPause]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-emerald-400 flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
          <Eye size={20} />
          2. Preview Video
        </h2>
      </div>

      <div className="flex flex-col gap-4">
        <div
          id="video-preview-container"
          ref={containerRef}
          onDoubleClick={handleFullscreen}
          className={`relative w-full aspect-video border border-zinc-800 bg-zinc-900 rounded-xl overflow-hidden flex items-center justify-center ${isEditing ? 'is-editing' : ''}`}
        >
          {!videoUrl ? (
            <p className="text-zinc-500 font-medium">
              Chưa có Video. Vui lòng chọn file video ở mục 1.
            </p>
          ) : (
            <>
              <video
                ref={videoElementRef}
                src={videoUrl}
                className="hidden"
                preload="auto"
                playsInline
                onTimeUpdate={handleTimeUpdate}
                onPlay={() => { if (audioElementRef.current) audioElementRef.current.play().catch(() => {}); }}
                onPause={() => { if (audioElementRef.current) audioElementRef.current.pause(); }}
                onSeeked={(e) => {
                  if (audioElementRef.current) {
                    const targetAudioTime = generatedAudioUrl
                      ? videoTimeToAudioTime(e.currentTarget.currentTime, syncCheckpoints, videoPlaybackRate)
                      : e.currentTarget.currentTime;
                    audioElementRef.current.currentTime = targetAudioTime;
                  }
                }}
                onWaiting={() => { if (audioElementRef.current) audioElementRef.current.pause(); }}
                onPlaying={() => { if (audioElementRef.current) audioElementRef.current.play().catch(() => {}); }}
                onLoadedMetadata={(e) => {
                  if (previewCanvasRef.current) {
                    previewCanvasRef.current.width = e.currentTarget.videoWidth || 1280;
                    previewCanvasRef.current.height = e.currentTarget.videoHeight || 720;
                  }
                  e.currentTarget.currentTime = 0.001;
                  setBlurBox(prev => prev.h > 0 ? prev : { x: 0, y: 83, w: 100, h: 14 });
                }}
              />
              {generatedAudioUrl && (
                <audio
                  ref={audioElementRef}
                  src={generatedAudioUrl}
                  preload="auto"
                  onLoadedMetadata={(e) => {
                    if (videoElementRef.current) {
                      const targetAudioTime = generatedAudioUrl
                        ? videoTimeToAudioTime(videoElementRef.current.currentTime, syncCheckpoints, videoPlaybackRate)
                        : videoElementRef.current.currentTime;
                      e.currentTarget.currentTime = targetAudioTime;
                    }
                  }}
                />
              )}

              <canvas
                ref={previewCanvasRef}
                className="w-full h-full object-contain cursor-pointer absolute inset-0 z-10 pointer-events-auto"
                onClick={togglePlayPause}
              />

              {isEditing && (
                <>
                  <div className={`alignment-guide-h ${showGuideH ? 'show-guide' : ''}`}></div>
                  <div className={`alignment-guide-v ${showGuideV ? 'show-guide' : ''}`}></div>
                </>
              )}

              <div className="floating-controls absolute top-4 right-4 z-50 flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); setIsEditing(!isEditing); }}
                  className={`p-2 rounded-lg backdrop-blur-md bg-black/40 border transition-colors ${isEditing ? 'border-emerald-500 text-emerald-400' : 'border-zinc-700 text-zinc-300 hover:text-emerald-400'}`}
                  title="Chế độ chỉnh sửa (Edit Mode)"
                >
                  <Pen size={18} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowTimeline(!showTimeline); }}
                  className={`p-2 rounded-lg backdrop-blur-md bg-black/40 border transition-colors ${showTimeline ? 'border-emerald-500 text-emerald-400' : 'border-zinc-700 text-zinc-300 hover:text-emerald-400'}`}
                  title="Ẩn/Hiện thanh tua video"
                >
                  <Eye size={18} />
                </button>
              </div>

              {(activePanel === 'blur' || blurIntensity > 0) && (
                <div
                  id="blur-box"
                  ref={blurBoxRef}
                  onMouseDown={(e) => handleMouseDown(e, 'blur')}
                  onWheel={(e) => {
                    e.preventDefault();
                    if (e.deltaY < 0) {
                      setBlurIntensity(prev => Math.min(50, prev + 1));
                    } else {
                      setBlurIntensity(prev => Math.max(0, prev - 1));
                    }
                  }}
                  style={{
                    position: 'absolute',
                    left: '0%',
                    top: `${blurBox.y}%`,
                    width: '100%',
                    height: `${blurBox.h}%`,
                    maxWidth: '100%',
                    maxHeight: `calc(100% - ${blurBox.y}%)`,
                    zIndex: 15,
                    boxSizing: 'border-box',
                    border: isEditing ? '2px dashed rgba(16, 185, 129, 0.8)' : 'none',
                    cursor: isEditing ? 'ns-resize' : 'default'
                  }}
                >
                  {isEditing && (
                    <div className="resize-handle">
                      <div className="w-2 h-2 border-b-2 border-r-2 border-emerald-500 pointer-events-none"></div>
                    </div>
                  )}
                </div>
              )}

              {logoUrl && (
                <div
                  id="logo-overlay-container"
                  ref={logoImgRef}
                  onMouseDown={(e) => handleMouseDown(e, 'logo')}
                  style={{
                    position: 'absolute',
                    left: `${logoX}%`,
                    top: `${logoY}%`,
                    width: `${logoScale}%`,
                    maxWidth: '100%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 20,
                    border: isEditing ? '1px dashed rgba(16, 185, 129, 0.5)' : 'none',
                    cursor: isEditing ? 'move' : 'default'
                  }}
                >
                  <img
                    id="logo-overlay"
                    src={logoUrl}
                    alt="Logo"
                    draggable="false"
                    className="w-full h-auto block pointer-events-none opacity-0"
                  />
                  {isEditing && (
                    <div className="resize-handle logo-resize-handle">
                      <div className="w-2 h-2 border-b-2 border-r-2 border-emerald-500 pointer-events-none"></div>
                    </div>
                  )}
                </div>
              )}

              {showTimeline && (
                <div className="video-playback-controls absolute bottom-0 left-0 w-full z-50 flex items-center gap-4 px-4 pb-3 pt-6 bg-gradient-to-t from-black/80 to-transparent">
                  <button
                    id="btn-rewind"
                    onClick={(e) => { e.stopPropagation(); skipBackward(5); }}
                    className="p-1.5 rounded-full text-zinc-300 hover:text-emerald-400 hover:bg-white/10 transition-colors flex items-center justify-center relative"
                    title="Tua lại 5s (Arrow Left)"
                  >
                    <RotateCcw size={20} />
                    <span className="text-[9px] absolute font-bold leading-none" style={{ marginTop: '2px' }}>5</span>
                  </button>

                  <input
                    type="range"
                    id="custom-seekbar"
                    className="flex-1 cursor-pointer"
                    min="0"
                    max="100"
                    step="0.1"
                    value={videoProgress}
                    onChange={(e) => seek(parseFloat(e.target.value))}
                    onMouseDown={(e) => e.stopPropagation()}
                  />

                  <button
                    id="btn-forward"
                    onClick={(e) => { e.stopPropagation(); skipForward(5); }}
                    className="p-1.5 rounded-full text-zinc-300 hover:text-emerald-400 hover:bg-white/10 transition-colors flex items-center justify-center relative"
                    title="Tua tới 5s (Arrow Right)"
                  >
                    <RotateCw size={20} />
                    <span className="text-[9px] absolute font-bold leading-none" style={{ marginTop: '2px' }}>5</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col gap-4 items-center" ref={toolbarRef}>
          <div className="inline-flex items-center gap-2 p-1.5 border border-zinc-800 bg-zinc-900 rounded-lg shadow-sm">
            <button onClick={() => setActivePanel(activePanel === 'blur' ? null : 'blur')} title="Làm mờ" className={`p-2.5 rounded transition-colors ${activePanel === 'blur' ? 'bg-emerald-500/10 text-emerald-400' : 'hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400'}`}>
              <Droplet size={20} />
            </button>
            <button onClick={() => setActivePanel(activePanel === 'text' ? null : 'text')} title="Văn bản" className={`p-2.5 rounded transition-colors ${activePanel === 'text' ? 'bg-emerald-500/10 text-emerald-400' : 'hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400'}`}>
              <Type size={20} />
            </button>
            <button onClick={() => setActivePanel(activePanel === 'logo' ? null : 'logo')} title="Logo" className={`p-2.5 rounded transition-colors ${activePanel === 'logo' ? 'bg-emerald-500/10 text-emerald-400' : 'hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400'}`}>
              <ImageIcon size={20} />
            </button>
            <div className="w-px h-6 bg-zinc-700 mx-1"></div>
            <button onClick={() => setActivePanel(activePanel === 'zoom' ? null : 'zoom')} title="Thu phóng" className={`p-2.5 rounded transition-colors ${activePanel === 'zoom' ? 'bg-emerald-500/10 text-emerald-400' : 'hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400'}`}>
              <ZoomIn size={20} />
            </button>
            <button onClick={() => setActivePanel(activePanel === 'mirror' ? null : 'mirror')} title="Đảo ngược" className={`p-2.5 rounded transition-colors ${activePanel === 'mirror' ? 'bg-emerald-500/10 text-emerald-400' : 'hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400'}`}>
              <FlipHorizontal size={20} />
            </button>
            <button onClick={() => setActivePanel(activePanel === 'volume' ? null : 'volume')} title="Âm lượng" className={`p-2.5 rounded transition-colors ${activePanel === 'volume' ? 'bg-emerald-500/10 text-emerald-400' : 'hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400'}`}>
              <Volume2 size={20} />
            </button>
            <div className="w-px h-6 bg-zinc-700 mx-1"></div>
            <button onClick={handleFullscreen} title="Toàn màn hình" className="p-2.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 transition-colors">
              <Maximize size={20} />
            </button>
          </div>

          {/* Settings Panels */}
          {activePanel === 'blur' && (
            <div className="w-full max-w-lg p-5 border border-zinc-800 bg-zinc-900 rounded-xl flex flex-col gap-5 animate-in fade-in slide-in-from-top-2 shadow-xl">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <Droplet size={18} />
                  <span>Che Phụ đề Tiếng Trung (Blur Box Parameters)</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 bg-zinc-950 p-3.5 border border-zinc-800/80 rounded-lg">
                <div className="flex justify-between items-center text-xs font-semibold text-zinc-300">
                  <span>Độ mờ khối (Blur Intensity)</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={blurIntensity}
                      onChange={e => setBlurIntensity(Math.min(50, Math.max(0, parseInt(e.target.value) || 0)))}
                      className="w-16 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-center text-emerald-400 font-bold text-xs outline-none focus:border-emerald-500"
                    />
                    <span className="text-zinc-500 text-[11px]">px</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  value={blurIntensity}
                  onChange={e => setBlurIntensity(Number(e.target.value))}
                  className="accent-emerald-500 w-full cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                />
              </div>

              <div className="flex flex-col">
                <button
                  onClick={detectAndFitChineseSubtitles}
                  onDoubleClick={forceScanChineseSubtitles}
                  title="Bấm để quét tự động. Nhấp đúp để ép quét sâu (Force Scan)."
                  disabled={isScanningSub || isForceScanning}
                  className="w-full py-2.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-xs shadow-sm"
                >
                  {(isScanningSub || isForceScanning) ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Đang xử lý tọa độ...</span>
                    </>
                  ) : (
                    <>
                      <Scan size={16} />
                      <span>Tự động Nhận diện (AI)</span>
                    </>
                  )}
                </button>

                <div className={`transition-all duration-500 overflow-hidden ${scanStatusMsg ? 'max-h-20 opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0'}`}>
                  {scanStatusMsg && (
                    <div className="p-2.5 bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 rounded-lg text-[11px] leading-relaxed shadow-inner">
                      {scanStatusMsg}
                    </div>
                  )}
                </div>
              </div>



              <div className="flex flex-col gap-3 bg-zinc-950 p-4 border border-zinc-800 rounded-lg">
                <div className="flex justify-between items-center text-xs font-bold text-zinc-300 border-b border-zinc-800/80 pb-2">
                  <span>Điều chỉnh Vị trí & Chiều cao Vùng Che Mờ (%)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-zinc-300 font-semibold">
                      <span>Vị trí Y (% từ trên xuống)</span>
                      <input
                        type="number"
                        step="0.5"
                        value={blurBox.y}
                        onChange={e => setBlurBox(p => ({ ...p, y: parseFloat(e.target.value) || 0 }))}
                        className="w-16 px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-right text-emerald-400 outline-none focus:border-emerald-500 font-mono font-bold"
                      />
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="0.5"
                      value={blurBox.y}
                      onChange={e => setBlurBox(p => ({ ...p, y: parseFloat(e.target.value) || 0 }))}
                      className="accent-emerald-500 w-full cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-zinc-400 font-medium">
                      <span>Chiều cao H (%)</span>
                      <input
                        type="number"
                        step="0.5"
                        value={blurBox.h}
                        onChange={e => setBlurBox(p => ({ ...p, h: parseFloat(e.target.value) || 0 }))}
                        className="w-16 px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-right text-zinc-200 outline-none focus:border-emerald-500 font-mono"
                      />
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="50"
                      step="0.5"
                      value={blurBox.h}
                      onChange={e => setBlurBox(p => ({ ...p, h: parseFloat(e.target.value) || 0 }))}
                      className="accent-emerald-500 w-full cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activePanel === 'text' && (
            <div className="w-full max-w-lg p-5 border border-zinc-800 bg-zinc-900 rounded-xl flex flex-col gap-5 animate-in fade-in slide-in-from-top-2 shadow-xl">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <Type size={18} />
                  <span>Thông số Phụ đề (CapCut Font & Stroke)</span>
                </div>
              </div>

              <div className="flex justify-start">
                <button
                  id="btn-center-text-blur"
                  onClick={() => {
                    const nextState = !isTextAutoCentered;
                    setIsTextAutoCentered(nextState);
                    if (nextState) {
                      setTextX(50);
                      setTextY(Number((blurBox.y + blurBox.h / 2).toFixed(1)));
                    }
                  }}
                  className={`py-2 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors text-xs ${
                    isTextAutoCentered
                      ? 'bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                      : 'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700'
                  }`}
                >
                  <AlignCenter size={16} />
                  <span>Căn giữa chữ vào vùng mờ</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="flex flex-col gap-1.5 bg-zinc-950 p-3 border border-zinc-800/80 rounded-lg">
                  <div className="flex justify-between items-center text-zinc-300 font-medium">
                    <span>Cỡ chữ (Font Size)</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        max="200"
                        value={fontSize}
                        onChange={e => setFontSize(Math.min(200, Math.max(1, parseInt(e.target.value) || 1)))}
                        className="w-14 px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-right text-emerald-400 font-bold font-mono outline-none focus:border-emerald-500"
                      />
                      <span className="text-zinc-500 text-[10px]">px</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="200"
                    value={fontSize}
                    onChange={e => setFontSize(Number(e.target.value))}
                    className="accent-emerald-500 w-full cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                  />
                </div>

                <div className="flex flex-col gap-1.5 bg-zinc-950 p-3 border border-zinc-800/80 rounded-lg">
                  <div className="flex justify-between items-center text-zinc-300 font-medium">
                    <span>Độ dày Viền đen</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={strokeWidth}
                        onChange={e => setStrokeWidth(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                        className="w-14 px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-right text-emerald-400 font-bold font-mono outline-none focus:border-emerald-500"
                      />
                      <span className="text-zinc-500 text-[10px]">pt</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={strokeWidth}
                    onChange={e => setStrokeWidth(Number(e.target.value))}
                    className="accent-emerald-500 w-full cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                  />
                </div>

                <div className="flex flex-col gap-1.5 bg-zinc-950 p-3 border border-zinc-800/80 rounded-lg">
                  <div className="flex justify-between items-center text-zinc-300 font-medium">
                    <span>Vị trí X (% ngang)</span>
                    <input
                      type="number"
                      step="0.5"
                      value={textX}
                      onChange={e => {
                        setTextX(e.target.value === '' ? 0 : parseFloat(e.target.value));
                        setIsTextAutoCentered(false);
                      }}
                      className="w-14 px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-right text-zinc-200 font-mono outline-none focus:border-emerald-500"
                    />
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="0.5"
                    value={textX}
                    onChange={e => {
                      setTextX(parseFloat(e.target.value));
                      setIsTextAutoCentered(false);
                    }}
                    className="accent-emerald-500 w-full cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                  />
                </div>

                <div className="flex flex-col gap-1.5 bg-zinc-950 p-3 border border-zinc-800/80 rounded-lg">
                  <div className="flex justify-between items-center text-zinc-300 font-medium">
                    <span>Vị trí Y (% dọc)</span>
                    <input
                      type="number"
                      step="0.5"
                      value={textY}
                      onChange={e => {
                        setTextY(e.target.value === '' ? 0 : parseFloat(e.target.value));
                        setIsTextAutoCentered(false);
                      }}
                      className="w-14 px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-right text-zinc-200 font-mono outline-none focus:border-emerald-500"
                    />
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="0.5"
                    value={textY}
                    onChange={e => {
                      setTextY(parseFloat(e.target.value));
                      setIsTextAutoCentered(false);
                    }}
                    className="accent-emerald-500 w-full cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                  />
                </div>
              </div>


            </div>
          )}

          {activePanel === 'logo' && (
            <div className="w-full max-w-lg p-5 border border-zinc-800 bg-zinc-900 rounded-xl flex flex-col gap-5 animate-in fade-in slide-in-from-top-2 shadow-xl">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <ImageIcon size={18} />
                  <span>Thông số Logo (Scale & Positioning)</span>
                </div>
                <div className="flex gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => handleAlignLogo('top-left')}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 active:bg-emerald-600 text-zinc-300 hover:text-white rounded font-medium transition-colors cursor-pointer text-xs"
                    title="Góc Trái-Trên (Sát mép trên cùng góc trái)"
                  >
                    Góc Trái-Trên
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAlignLogo('top-right')}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 active:bg-emerald-600 text-zinc-300 hover:text-white rounded font-medium transition-colors cursor-pointer text-xs"
                    title="Góc Phải-Trên (Sát mép trên cùng góc phải)"
                  >
                    Góc Phải-Trên
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5 bg-zinc-950 p-3 border border-zinc-800/80 rounded-lg text-xs">
                  <div className="flex justify-between items-center text-zinc-300 font-medium">
                    <span>Thu phóng Logo (Scale %)</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="10"
                        max="300"
                        value={logoScale}
                        onChange={e => setLogoScale(Math.min(300, Math.max(10, parseInt(e.target.value) || 10)))}
                        className="w-16 px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-right text-emerald-400 font-bold font-mono outline-none focus:border-emerald-500"
                      />
                      <span className="text-zinc-500 text-[10px]">%</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="300"
                    value={logoScale}
                    onChange={e => setLogoScale(Number(e.target.value))}
                    className="accent-emerald-500 w-full cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex flex-col gap-1.5 bg-zinc-950 p-3 border border-zinc-800/80 rounded-lg">
                    <div className="flex justify-between items-center text-zinc-300 font-medium">
                      <span>Vị trí X (% ngang)</span>
                      <input
                        type="number"
                        step="0.5"
                        value={logoX}
                        onChange={e => setLogoX(e.target.value === '' ? 0 : parseFloat(e.target.value))}
                        className="w-16 px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-right text-zinc-200 font-mono outline-none focus:border-emerald-500"
                      />
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="0.5"
                      value={logoX}
                      onChange={e => setLogoX(parseFloat(e.target.value))}
                      className="accent-emerald-500 w-full cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 bg-zinc-950 p-3 border border-zinc-800/80 rounded-lg">
                    <div className="flex justify-between items-center text-zinc-300 font-medium">
                      <span>Vị trí Y (% dọc)</span>
                      <input
                        type="number"
                        step="0.5"
                        value={logoY}
                        onChange={e => setLogoY(e.target.value === '' ? 0 : parseFloat(e.target.value))}
                        className="w-16 px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-right text-zinc-200 font-mono outline-none focus:border-emerald-500"
                      />
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="0.5"
                      value={logoY}
                      onChange={e => setLogoY(parseFloat(e.target.value))}
                      className="accent-emerald-500 w-full cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activePanel === 'zoom' && (
            <div className="w-full max-w-lg p-5 border border-zinc-800 bg-zinc-900 rounded-xl flex flex-col gap-4 animate-in fade-in slide-in-from-top-2">
              <label className="flex flex-col gap-3 text-sm font-medium text-zinc-300">
                <div className="flex justify-between">
                  <span>Thu phóng (Zoom)</span>
                  <span className="text-emerald-400">{zoomLevel}%</span>
                </div>
                <input type="range" min="90" max="110" value={zoomLevel} onChange={e => setZoomLevel(Number(e.target.value))} className="accent-emerald-500 w-full" />
              </label>
            </div>
          )}

          {activePanel === 'mirror' && (
            <div className="w-full max-w-lg p-5 border border-zinc-800 bg-zinc-900 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-top-2">
              <span className="text-sm font-medium text-zinc-300">Đảo ngược video theo chiều ngang (Mirror)</span>
              <button
                onClick={() => setIsMirrored(!isMirrored)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-900 ${isMirrored ? 'bg-emerald-500' : 'bg-zinc-700'}`}
              >
                <span className="sr-only">Toggle mirror</span>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isMirrored ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          )}

          {activePanel === 'volume' && (
            <div className="w-full max-w-lg p-5 border border-zinc-800 bg-zinc-900 rounded-xl flex flex-col gap-5 animate-in fade-in slide-in-from-top-2 shadow-xl">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <Volume2 size={18} />
                  <span>Cấu hình Âm lượng (Audio Volume Settings)</span>
                </div>
              </div>

              <div className="flex flex-col gap-4 text-xs">
                {/* Âm lượng Lồng tiếng */}
                <div className="flex flex-col gap-2.5 bg-zinc-950 p-3.5 border border-zinc-800/80 rounded-lg">
                  <div className="flex justify-between items-center font-semibold text-zinc-200">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <Mic size={16} />
                      <span>Âm lượng Lồng tiếng (Dubbing Voice)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={dubbingVolume}
                        onChange={e => setDubbingVolume(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                        className="w-16 px-2 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-center text-emerald-400 font-bold text-xs outline-none focus:border-emerald-500 font-mono"
                      />
                      <span className="text-zinc-500 font-medium">%</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={dubbingVolume}
                    onChange={e => setDubbingVolume(Number(e.target.value))}
                    className="accent-emerald-500 w-full cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                  />
                </div>

                {/* Âm lượng Video Gốc */}
                <div className="flex flex-col gap-2.5 bg-zinc-950 p-3.5 border border-zinc-800/80 rounded-lg">
                  <div className="flex justify-between items-center font-semibold text-zinc-200">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <Film size={16} />
                      <span>Âm lượng Video Gốc (Original Video)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={originalVideoVolume}
                        onChange={e => setOriginalVideoVolume(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                        className="w-16 px-2 py-0.5 bg-zinc-900 border border-zinc-700 rounded text-center text-emerald-400 font-bold text-xs outline-none focus:border-emerald-500 font-mono"
                      />
                      <span className="text-zinc-500 font-medium">%</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={originalVideoVolume}
                    onChange={e => setOriginalVideoVolume(Number(e.target.value))}
                    className="accent-emerald-500 w-full cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
