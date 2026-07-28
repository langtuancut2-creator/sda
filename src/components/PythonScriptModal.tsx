import React from 'react';
import { useVideoProcessing } from '../contexts/VideoProcessingContext';

export const PythonScriptModal: React.FC = () => {
  const { showPythonModal, setShowPythonModal } = useVideoProcessing();

  if (!showPythonModal) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex justify-between items-center px-6 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-2">
            <span className="text-xl">🐍</span>
            <h3 className="text-emerald-400 font-bold text-base">Script Python Tự Động Lồng Tiếng CapCut (vn_003) & Sync Video</h3>
          </div>
          <button
            onClick={() => setShowPythonModal(false)}
            className="text-zinc-400 hover:text-white text-lg font-bold p-1 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 text-xs text-zinc-300 leading-relaxed">
          <div className="p-3 bg-emerald-950/30 border border-emerald-500/20 rounded-xl text-emerald-300">
            📌 <strong>Quy trình xử lý tự động:</strong>
            <ol className="list-decimal pl-5 mt-1 space-y-1 text-[11px]">
              <li>Tự động scale thời gian tệp SRT về <strong>0.5x</strong> (kéo giãn mốc thời gian gấp đôi).</li>
              <li>Gọi API CapCut lồng tiếng giọng <strong>Cô gái hoạt ngôn (vn_003)</strong> với Session ID <code>3805a2f884764f5cd3d5393136d15802</code>.</li>
              <li>Tăng tốc file MP3 tổng kết hợp lên <strong>1.9x</strong> để giữ nhịp phim chậm vừa phải.</li>
              <li>Căn chỉnh toàn bộ Video & Phụ đề SRT khớp chính xác tuyệt đối với file MP3 đã xử lý.</li>
            </ol>
          </div>

          <div>
            <h4 className="text-sm font-bold text-white mb-2">1. Cài đặt thư viện yêu cầu trên Máy tính (CMD / Terminal)</h4>
            <pre className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-emerald-400 font-mono text-[11px] overflow-x-auto select-all">
              pip install capcut-tts-api pydub moviepy tqdm
            </pre>
            <p className="mt-1 text-[11px] text-zinc-400">* Lưu ý: Bạn cần cài đặt FFmpeg trên máy tính và thêm vào PATH để <code>pydub</code> & <code>moviepy</code> hoạt động mượt mà.</p>
          </div>

          <div>
            <h4 className="text-sm font-bold text-white mb-2">2. Mã nguồn Python Tối Ưu Đa Luồng & Tốc Độ Cao (main.py)</h4>
            <pre className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-200 font-mono text-[11px] overflow-x-auto select-all whitespace-pre">
{`import os
import re
import gc
from concurrent.futures import ThreadPoolExecutor, as_completed
from pydub import AudioSegment
from pydub.effects import speedup
from capcut_tts_api import CapCutClient
import moviepy.editor as mp
from tqdm import tqdm

SESSION_ID = "3805a2f884764f5cd3d5393136d15802"
VOICE_TYPE = "vn_003"  # Cô gái hoạt ngôn
SRT_PATH = "subtitle.srt"
VIDEO_PATH = "input_video.mp4"
FINAL_AUDIO_MP3 = "final_audio_1.9x.mp3"
FINAL_VIDEO_OUTPUT = "final_output_synced.mp4"
MAX_WORKERS = 8  # Đa luồng tải song song 8 câu cùng lúc

def parse_and_scale_srt(srt_file, scale_factor=0.5):
    with open(srt_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    pattern = re.compile(
        r'(\\d+)\\n(\\d{2}):(\\d{2}):(\\d{2})[,.](\\d{3})\\s*-->\\s*(\\d{2}):(\\d{2}):(\\d{2})[,.](\\d{3})\\n(.*?)(?=\\n\\n|\\Z)',
        re.DOTALL
    )
    
    subtitles = []
    for match in pattern.findall(content):
        start_ms = ((int(match[1])*3600 + int(match[2])*60 + int(match[3]))*1000 + int(match[4])) / scale_factor
        end_ms = ((int(match[5])*3600 + int(match[6])*60 + int(match[7]))*1000 + int(match[8])) / scale_factor
        text = match[9].replace('\\n', ' ').strip()
        subtitles.append({"start": int(start_ms), "end": int(end_ms), "text": text})
    return subtitles

def fetch_tts_segment(idx, text, client):
    try:
        res = client.generate_speech(texts=text, voice=VOICE_TYPE, rate="1.0", wait=True)
        audio_file = res.get('filename') or res.get('file_path') or f'temp_{idx}.mp3'
        if os.path.exists(audio_file):
            seg = AudioSegment.from_file(audio_file)
            try:
                os.remove(audio_file)
            except Exception:
                pass
            return idx, seg
    except Exception as e:
        print(f"\\n⚠️ Lỗi tải TTS câu {idx+1}: {e}")
    return idx, None

def main():
    os.environ["CAPCUT_SESSION_ID"] = SESSION_ID
    client = CapCutClient()
    
    print("📜 Đang đọc và scale tệp SRT về 0.5x...")
    subs = parse_and_scale_srt(SRT_PATH, scale_factor=0.5)
    total_subs = len(subs)
    print(f"✅ Đã tải {total_subs} câu phụ đề.")

    audio_results = [None] * total_subs
    print(f"🚀 Bắt đầu gọi CapCut TTS Đa Luồng ({MAX_WORKERS} workers)...")
    
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(fetch_tts_segment, idx, sub["text"], client): idx 
            for idx, sub in enumerate(subs)
        }
        
        for future in tqdm(as_completed(futures), total=total_subs, desc="🎙️ Tiến trình CapCut TTS"):
            idx, seg = future.result()
            audio_results[idx] = seg

    master_audio = AudioSegment.empty()
    current_pos = 0

    for idx, sub in enumerate(subs):
        start_ms = sub["start"]
        seg = audio_results[idx]
        
        if start_ms > current_pos:
            master_audio += AudioSegment.silent(duration=(start_ms - current_pos))
            current_pos = start_ms
            
        if seg is not None:
            master_audio += seg
            current_pos += len(seg)

    del audio_results
    gc.collect()

    final_audio_1_9x = speedup(master_audio, playback_speed=1.9)
    final_audio_1_9x.export(FINAL_AUDIO_MP3, format="mp3")
    print(f"🎉 Xuất thành công file audio: {FINAL_AUDIO_MP3}")

    if os.path.exists(VIDEO_PATH):
        video = mp.VideoFileClip(VIDEO_PATH)
        audio = mp.AudioFileClip(FINAL_AUDIO_MP3)
        video_speed_factor = video.duration / audio.duration
        final_video = video.fx(mp.vfx.speedx, video_speed_factor).set_audio(audio)
        final_video.write_videofile(FINAL_VIDEO_OUTPUT, codec="libx264", audio_codec="aac", preset="fast", threads=4)
        print(f"✨ HOÀN TẤT VÀ XUẤT VIDEO ĐỒNG BỘ: {FINAL_VIDEO_OUTPUT}")

if __name__ == '__main__':
    main()`}
            </pre>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-950/60 flex justify-end">
          <button
            onClick={() => setShowPythonModal(false)}
            className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold rounded-xl transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

export default PythonScriptModal;
