import React from 'react';
import { Film, Sparkles } from 'lucide-react';

interface HeaderProps {
  onOpenExport?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenExport }) => {
  return (
    <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-zinc-800">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-emerald-400 tracking-tight flex items-center gap-3">
          Video Studio Pro
        </h1>
        <p className="text-xs text-zinc-400 mt-1">Hệ thống xử lý video, che phụ đề & lồng tiếng AI CapCut</p>
      </div>

      {onOpenExport && (
        <button
          onClick={onOpenExport}
          className="px-5 py-2.5 bg-emerald-400 hover:bg-emerald-300 text-zinc-950 font-bold text-xs rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
        >
          <Film className="w-4 h-4" />
          <span>Xuất Video Pro</span>
          <Sparkles className="w-3.5 h-3.5 text-zinc-900" />
        </button>
      )}
    </header>
  );
};

export default Header;
