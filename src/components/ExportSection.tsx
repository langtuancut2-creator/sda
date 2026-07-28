import React from 'react';
import { Film, Play } from 'lucide-react';
import { useVideoProcessing } from '../contexts/VideoProcessingContext';

export const ExportSection: React.FC = () => {
  const { isExporting, handleProcess, videoFile } = useVideoProcessing();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-emerald-400 flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
          <Film size={20} />
          4. Xuất Video
        </h2>
      </div>

      <button
        onClick={handleProcess}
        disabled={isExporting || !videoFile}
        className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-base shadow-lg shadow-emerald-500/10 cursor-pointer"
      >
        <Play size={20} fill="currentColor" />
        XỬ LÝ &amp; TẢI VIDEO HOÀN CHỈNH
      </button>
    </div>
  );
};

export default ExportSection;
