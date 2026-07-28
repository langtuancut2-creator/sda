import { FrameSyncPoint } from '../types/VideoExport';

export function calculateAudioFrameMapping(
  fps: number = 30,
  duration: number,
  sampleRate: number = 48000
): FrameSyncPoint[] {
  const totalFrames = Math.ceil(duration * fps);
  const samplesPerFrame = sampleRate / fps;
  const syncMap: FrameSyncPoint[] = [];

  for (let frame = 0; frame < totalFrames; frame++) {
    const videoTime = frame / fps;
    const audioStartSample = Math.floor(videoTime * sampleRate);
    const audioEndSample = Math.floor(audioStartSample + samplesPerFrame);

    syncMap.push({
      frameIndex: frame,
      videoTime,
      audioStartSample,
      audioEndSample,
      audioStartMs: (audioStartSample / sampleRate) * 1000,
      audioEndMs: (audioEndSample / sampleRate) * 1000
    });
  }

  return syncMap;
}

export function checkLipSyncDrift(syncMap: FrameSyncPoint[], thresholdMs: number = 1): boolean {
  for (let i = 1; i < syncMap.length; i++) {
    const expectedTimeMs = (i / 30) * 1000;
    const actualTimeMs = syncMap[i].audioStartMs;
    if (Math.abs(actualTimeMs - expectedTimeMs) > thresholdMs) {
      return false;
    }
  }
  return true;
}

export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const out = new DataView(new ArrayBuffer(length));
  let channels: Float32Array[] = [];
  let sampleRate = buffer.sampleRate;
  let offset = 0;

  function writeString(str: string) {
    for (let i = 0; i < str.length; i++) {
      out.setUint8(offset++, str.charCodeAt(i));
    }
  }

  function setUint16(data: number) {
    out.setUint16(offset, data, true);
    offset += 2;
  }

  function setUint32(data: number) {
    out.setUint32(offset, data, true);
    offset += 4;
  }

  // RIFF header
  writeString('RIFF');
  setUint32(length - 8);
  writeString('WAVE');

  // fmt chunk
  writeString('fmt ');
  setUint32(16); // length of fmt chunk
  setUint16(1);  // raw PCM
  setUint16(numOfChan);
  setUint32(sampleRate);
  setUint32(sampleRate * 2 * numOfChan); // byte rate
  setUint16(numOfChan * 2); // block align
  setUint16(16); // 16-bit PCM

  // data chunk
  writeString('data');
  setUint32(length - offset - 4);

  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  let sampleIndex = 0;
  while (sampleIndex < buffer.length) {
    for (let c = 0; c < numOfChan; c++) {
      let sample = Math.max(-1, Math.min(1, channels[c][sampleIndex]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      out.setInt16(offset, sample, true);
      offset += 2;
    }
    sampleIndex++;
  }

  return new Blob([out.buffer], { type: 'audio/wav' });
}

export function useAudioExportSync() {
  return {
    calculateAudioFrameMapping,
    checkLipSyncDrift,
    audioBufferToWavBlob
  };
}
