import React, { useState, useRef, useEffect, useCallback } from 'react';

export const useVideoState = () => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const [videoProgress, setVideoProgress] = useState(0);
  const [videoPlaybackRate, setVideoPlaybackRate] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const videoElementRef = useRef<HTMLVideoElement>(null);
  const audioElementRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const logoImgRef = useRef<HTMLDivElement>(null);
  const blurBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (videoFile) {
      const url = URL.createObjectURL(videoFile);
      setVideoUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setVideoUrl(null);
    }
  }, [videoFile]);

  useEffect(() => {
    if (logoFile) {
      const url = URL.createObjectURL(logoFile);
      setLogoUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setLogoUrl(null);
    }
  }, [logoFile]);

  const togglePlayPause = useCallback(() => {
    if (videoElementRef.current) {
      if (videoElementRef.current.paused) {
        videoElementRef.current.play().catch(() => {});
      } else {
        videoElementRef.current.pause();
      }
    }
  }, []);

  const skipBackward = useCallback((seconds: number = 5) => {
    if (videoElementRef.current) {
      videoElementRef.current.currentTime -= seconds;
    }
  }, []);

  const skipForward = useCallback((seconds: number = 5) => {
    if (videoElementRef.current) {
      videoElementRef.current.currentTime += seconds;
    }
  }, []);

  const seek = useCallback((progressPercent: number) => {
    if (videoElementRef.current && videoElementRef.current.duration) {
      setVideoProgress(progressPercent);
      const newTime = (progressPercent / 100) * videoElementRef.current.duration;
      videoElementRef.current.currentTime = newTime;
    }
  }, []);

  const handleTimeUpdate = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.target as HTMLVideoElement;
    const curr = video.currentTime;
    setCurrentTime(curr);
    if (video.duration) {
      setDuration(video.duration);
      const newProg = Math.round((curr / video.duration) * 1000) / 10;
      setVideoProgress(prev => Math.abs(prev - newProg) >= 0.2 ? newProg : prev);
    }
  }, []);

  return {
    videoFile, setVideoFile,
    subtitleFile, setSubtitleFile,
    logoFile, setLogoFile,
    videoUrl, logoUrl,
    videoProgress, setVideoProgress,
    videoPlaybackRate, setVideoPlaybackRate,
    currentTime, duration,
    videoElementRef, audioElementRef, containerRef, previewCanvasRef, logoImgRef, blurBoxRef,
    togglePlayPause, skipBackward, skipForward, seek, handleTimeUpdate
  };
};
