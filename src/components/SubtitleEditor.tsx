import React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useVideoProcessing } from '../contexts/VideoProcessingContext';
import { VIETNAM_VOICE_PROFILES } from '../VietnamVoiceOptimizationEngine';
import { formatMsToTimestamp } from '../hooks/useTTSPipeline';

export const SubtitleEditor: React.FC = () => {
  const {
    subtitles,
    voiceProfile,
    setVoiceProfile,
    isGeneratingAudioTimeline,
    audioTimelineProgress,
    generateAudioTimeline,
    videoElementRef
  } = useVideoProcessing();

  return (
    <div className="flex flex-col gap-4 bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 shadow-xl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <h2 className="text-emerald-400 text-sm font-bold uppercase tracking-wider flex items-center gap-2">
            3. Lồng Tiếng AI CapCut & Phụ Đề
          </h2>
          <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-[11px] font-medium ml-2">
            ⚡ SRT 0.5x
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={generateAudioTimeline}
            disabled={isGeneratingAudioTimeline || subtitles.length === 0}
            className="px-3.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
            title="Xuất file âm thanh timeline hoàn chỉnh khớp thời gian phụ đề"
          >
            {isGeneratingAudioTimeline ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>{audioTimelineProgress || "Đang tổng hợp..."}</span>
              </>
            ) : (
              <>
                <Download size={14} />
                <span>Tạo & Xuất MP3 Khớp Video ({subtitles.length} câu)</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between bg-zinc-950 p-3 rounded-lg border border-zinc-800">
        <span className="text-xs text-zinc-400 font-medium">Chọn giọng đọc AI:</span>
        <select
          value={Object.keys(VIETNAM_VOICE_PROFILES).find(
            k => VIETNAM_VOICE_PROFILES[k].name === voiceProfile.name
          )}
          onChange={(e) => setVoiceProfile(VIETNAM_VOICE_PROFILES[e.target.value])}
          className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
        >
          <option value="vn_female_neutral">Cô gái hoạt ngôn (chuẩn)</option>
        </select>
      </div>

      {/* SRT Subtitle List */}
      <div className="srt-preview-container" style={{ marginTop: '10px', background: '#121214', border: '1px solid #27272a', borderRadius: '6px', maxHeight: '250px', overflowY: 'auto', padding: '8px' }}>
        {subtitles.length === 0 ? (
          <div className="p-4 text-center text-zinc-500 text-xs">
            Chưa có phân đoạn phụ đề. Vui lòng nạp tệp .srt ở mục 1.
          </div>
        ) : (
          subtitles.map((sub, idx) => (
            <div
              key={idx}
              className="srt-item hover:bg-zinc-900/80 transition-colors"
              data-index={idx + 1}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderBottom: '1px solid #1f1f23', fontSize: '13px', color: '#d4d4d8' }}
            >
              <div
                style={{ display: 'flex', gap: '10px', alignItems: 'center', cursor: 'pointer', flex: 1, minWidth: 0 }}
                onClick={() => {
                  if (videoElementRef.current) {
                    videoElementRef.current.currentTime = sub.start;
                    videoElementRef.current.play();
                  }
                }}
                title="Bấm để nhảy video tới thời điểm này"
              >
                <span style={{ color: '#71717a', fontSize: '11px', fontFamily: 'monospace', flexShrink: 0 }}>
                  {formatMsToTimestamp(sub.start * 1000)} --&gt; {formatMsToTimestamp(sub.end * 1000)}
                </span>
                <span className="srt-text truncate" style={{ color: '#d4d4d8' }}>{sub.text}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SubtitleEditor;
