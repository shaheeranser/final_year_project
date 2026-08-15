export function captureSnapshot(video: HTMLVideoElement): string | null {
  if (video.readyState < 2) {
    return null;
  }
  
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

/** Lightweight snapshot for fast live stream (320x240 @ 0.5 quality ~10KB) */
export function capturePreviewSnapshot(video: HTMLVideoElement): string | null {
  if (video.readyState < 2) {
    return null;
  }
  
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 240;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  
  ctx.drawImage(video, 0, 0, 320, 240);
  return canvas.toDataURL('image/jpeg', 0.5);
}
