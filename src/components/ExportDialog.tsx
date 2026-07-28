import React from 'react';
import { Loader2, Download, X } from 'lucide-react';
import { useVideoProcessing } from '../contexts/VideoProcessingContext';

export const ExportDialog: React.FC = () => {
  const {
    isExporting,
    exportProgress,
    exportStatusText,
    cancelExport
  } = useVideoProcessing();

  if (!isExporting) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl flex flex-col gap-6 relative">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3 text-emerald-400 font-bold text-lg">
            <Loader2 className="animate-spin" size={24} />
            <span>Đang xử lý Video</span>
          </div>
          <button
            onClick={cancelExport}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Hủy tiến trình"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center text-sm font-semibold">
            <span className="text-zinc-300">{exportStatusText || 'Đang render khung hình...'}</span>
            <span className="text-emerald-400 font-bold text-base">{exportProgress}%</span>
          </div>

          <div className="w-full bg-zinc-950 rounded-full h-3 overflow-hidden border border-zinc-800 p-0.5">
            <div
              className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-full rounded-full transition-all duration-150 ease-out"
              style={{ width: `${exportProgress}%` }}
            />
          </div>
        </div>

        <div className="p-4 bg-zinc-950/80 border border-zinc-800/80 rounded-xl text-xs text-zinc-400 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-zinc-300 font-medium">
            <Download size={14} className="text-emerald-400" />
            <span>Tự động tải về khi hoàn tất</span>
          </div>
          <p className="text-zinc-500 leading-relaxed">
            Hệ thống đang lồng ghép toàn bộ các lớp (Phụ đề Bangers, Khối Blur, Logo & Đảo chiều video). Vui lòng giữ trình duyệt mở.
          </p>
        </div>

        <button
          onClick={cancelExport}
          className="w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-sm font-medium rounded-xl transition-colors border border-zinc-700"
        >
          Hủy tiến trình xuất file
        </button>
      </div>
    </div>
  );
};

export default ExportDialog;
