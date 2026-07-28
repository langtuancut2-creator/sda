import React from 'react';
import { SettingsProvider } from './contexts/SettingsContext';
import { CacheProvider } from './contexts/CacheContext';
import { VideoProcessingProvider } from './contexts/VideoProcessingContext';
import { Header } from './components/Header';
import { FileInputSection } from './components/FileInputSection';
import { VideoPlayer } from './components/VideoPlayer';
import { SubtitleEditor } from './components/SubtitleEditor';
import { PythonScriptModal } from './components/PythonScriptModal';

export default function App() {
  return (
    <CacheProvider>
      <SettingsProvider>
        <VideoProcessingProvider>
          <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 sm:p-6 md:p-8 font-sans selection:bg-emerald-500 selection:text-zinc-950">
            <div className="max-w-6xl mx-auto flex flex-col gap-8">
              <Header />
              <FileInputSection />
              <VideoPlayer />
              <SubtitleEditor />
            </div>

            <PythonScriptModal />
          </div>
        </VideoProcessingProvider>
      </SettingsProvider>
    </CacheProvider>
  );
}
