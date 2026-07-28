import React from 'react';
import { CloudUpload, FileVideo, FileText, Image as ImageIcon, CheckCircle2 } from 'lucide-react';
import { useVideoProcessing } from '../contexts/VideoProcessingContext';

export const FileInputSection: React.FC = () => {
  const {
    videoFile, setVideoFile,
    subtitleFile, setSubtitleFile,
    logoFile, setLogoFile,
    videoRef, subtitleRef, logoRef,
    handleFileChange
  } = useVideoProcessing();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-emerald-400 flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
          <CloudUpload size={20} />
          1. Nạp tệp đầu vào
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* File Input: Video */}
        <input
          type="file"
          accept=".mp4,.webm"
          className="hidden"
          ref={videoRef}
          onChange={handleFileChange(setVideoFile)}
        />
        <div
          onClick={() => videoRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-6 flex flex-col gap-4 cursor-pointer transition-all ${
            videoFile ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-900'
          }`}
        >
          <div className="flex justify-between items-start">
            <div className={`flex items-center gap-2 font-semibold ${videoFile ? 'text-emerald-400' : 'text-zinc-100'}`}>
              <FileVideo size={20} />
              Video gốc
            </div>
            {videoFile && <CheckCircle2 size={18} className="text-emerald-500" />}
          </div>
          <div className="text-sm">
            {videoFile ? (
              <span className="text-emerald-300 break-all">{videoFile.name}</span>
            ) : (
              <span className="text-zinc-500 font-medium">Chọn file .mp4, .webm</span>
            )}
          </div>
        </div>

        {/* File Input: Subtitle */}
        <input
          type="file"
          accept=".srt"
          className="hidden"
          ref={subtitleRef}
          onChange={handleFileChange(setSubtitleFile)}
        />
        <div
          onClick={() => subtitleRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-6 flex flex-col gap-4 cursor-pointer transition-all ${
            subtitleFile ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-900'
          }`}
        >
          <div className="flex justify-between items-start">
            <div className={`flex items-center gap-2 font-semibold ${subtitleFile ? 'text-emerald-400' : 'text-zinc-100'}`}>
              <FileText size={20} />
              Phụ đề SRT
            </div>
            {subtitleFile && <CheckCircle2 size={18} className="text-emerald-500" />}
          </div>
          <div className="text-sm">
            {subtitleFile ? (
              <span className="text-emerald-300 break-all">{subtitleFile.name}</span>
            ) : (
              <span className="text-zinc-500 font-medium">Chọn file .srt</span>
            )}
          </div>
        </div>

        {/* File Input: Logo */}
        <input
          type="file"
          accept=".png"
          className="hidden"
          ref={logoRef}
          onChange={handleFileChange(setLogoFile)}
        />
        <div
          onClick={() => logoRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-6 flex flex-col gap-4 cursor-pointer transition-all ${
            logoFile ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-900'
          }`}
        >
          <div className="flex justify-between items-start">
            <div className={`flex items-center gap-2 font-semibold ${logoFile ? 'text-emerald-400' : 'text-zinc-100'}`}>
              <ImageIcon size={20} />
              Logo kênh
            </div>
            {logoFile && <CheckCircle2 size={18} className="text-emerald-500" />}
          </div>
          <div className="text-sm">
            {logoFile ? (
              <span className="text-emerald-300 break-all">{logoFile.name}</span>
            ) : (
              <span className="text-zinc-500 font-medium">Chọn file .png</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileInputSection;
