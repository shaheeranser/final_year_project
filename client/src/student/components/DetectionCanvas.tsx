/**
 * DetectionCanvas.tsx
 *
 * Pure presentational component: draws bounding boxes and flag indicators
 * on a canvas overlay. Receives already-computed data via props — no
 * detection or threshold logic here.
 */

import { useEffect, useRef } from 'react';
import type { Detection } from '../../shared/types/detection';

interface DetectionCanvasProps {
  /** Detections to draw (boxes, labels) */
  detections: Detection[];
  /** Width of the canvas */
  width: number;
  /** Height of the canvas */
  height: number;
}

/** Colour map for different detection labels */
const LABEL_COLORS: Record<string, string> = {
  'cell phone': '#ff4d6a',
  book: '#ff9f43',
  laptop: '#ee5a24',
  head_pose: '#a55eea',
  eye_gaze: '#3dc1d3',
};

const DEFAULT_COLOR = '#ffc312';

export function DetectionCanvas({
  detections,
  width,
  height,
}: DetectionCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear previous frame
    ctx.clearRect(0, 0, width, height);

    for (const det of detections) {
      const color = LABEL_COLORS[det.label] ?? DEFAULT_COLOR;

      // Draw bounding box if available
      if (det.bbox) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(det.bbox.x, det.bbox.y, det.bbox.width, det.bbox.height);

        // Label background
        const label = `${det.label} (${Math.round(det.confidence * 100)}%)`;
        ctx.font = '13px Inter, sans-serif';
        const textMetrics = ctx.measureText(label);
        const textHeight = 18;
        const pad = 4;

        ctx.fillStyle = color;
        ctx.fillRect(
          det.bbox.x,
          det.bbox.y - textHeight - pad,
          textMetrics.width + pad * 2,
          textHeight + pad,
        );

        ctx.fillStyle = '#fff';
        ctx.fillText(label, det.bbox.x + pad, det.bbox.y - pad - 2);
      }
    }

    // Draw non-bbox flags as status indicators in the top-right corner
    const flagDetections = detections.filter((d) => !d.bbox);
    if (flagDetections.length > 0) {
      const startY = 24;
      const lineHeight = 28;

      for (let i = 0; i < flagDetections.length; i++) {
        const flag = flagDetections[i];
        const color = LABEL_COLORS[flag.label] ?? DEFAULT_COLOR;
        const y = startY + i * lineHeight;

        // Indicator dot
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(width - 150, y, 6, 0, Math.PI * 2);
        ctx.fill();

        // Label text
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 13px Inter, sans-serif';
        ctx.fillText(flag.label.replace('_', ' ').toUpperCase(), width - 138, y + 4);
      }
    }
  }, [detections, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="detection-canvas"
    />
  );
}
