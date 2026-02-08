"use client";

import { useRef, useEffect, useState, useCallback } from "react";

interface VideoDevice {
  deviceId: string;
  label: string;
}

interface CapturedFrame {
  src: string;
  timestamp: string;
}

type LogEntry = {
  time: string;
  message: string;
  type: "accepted" | "skipped" | "info" | "error";
};

interface ActivityDetection {
  activity: string;
  estimatedQuantity: string;
  co2Kg: number;
}

interface AnalysisResult {
  summary: string;
  activities: ActivityDetection[];
  totalCO2Kg: number;
  scoreChange: number;
  timestamps: string[];
  batchNumber: number;
  cumulativeScore: number;
}

const MAX_FRAMES = 12;
const TIMEOUT_SECONDS = 300;

function getTimestamp(): string {
  const now = new Date();
  return now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

const TEST_DEVICE_ID = "__test-pattern__";

export default function CaptureSession() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const capturingRef = useRef(false);

  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<VideoDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [frames, setFrames] = useState<CapturedFrame[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [checkedCount, setCheckedCount] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [cumulativeScore, setCumulativeScore] = useState(0);

  const addLog = useCallback(
    (message: string, type: LogEntry["type"] = "info") => {
      setLog((prev) => [{ time: getTimestamp(), message, type }, ...prev]);
    },
    []
  );

  // Enumerate available video devices
  useEffect(() => {
    const getDevices = async () => {
      try {
        const deviceList = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = deviceList
          .filter((device) => device.kind === "videoinput")
          .map((device) => ({
            deviceId: device.deviceId,
            label: device.label || `Camera ${device.deviceId.slice(0, 8)}`,
          }));

        // Add test pattern option
        const allDevices: VideoDevice[] = [
          { deviceId: TEST_DEVICE_ID, label: "📁 Upload Video (no camera)" },
          ...videoDevices,
        ];

        setDevices(allDevices);

        if (!selectedDeviceId) {
          setSelectedDeviceId(allDevices[0].deviceId);
        }
      } catch (err) {
        console.error("Error enumerating devices:", err);
      }
    };

    getDevices();
  }, [selectedDeviceId]);

  // Handle video file upload
  const handleVideoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Revoke previous object URL if any
    if (uploadedVideoUrl) {
      URL.revokeObjectURL(uploadedVideoUrl);
    }

    const url = URL.createObjectURL(file);
    setUploadedVideoUrl(url);

    // Stop any existing camera stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Set the video element to play the uploaded file
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = url;
      videoRef.current.loop = true;
      videoRef.current.play().catch(console.error);
      setError(null);
    }

    addLog(`Video loaded: ${file.name}`, "info");
  }, [uploadedVideoUrl, addLog]);

  // Initialize or switch camera based on selected device
  useEffect(() => {
    if (!selectedDeviceId) return;

    // Stop previous stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (selectedDeviceId === TEST_DEVICE_ID) {
      // For upload mode, clear any camera stream and show upload prompt
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        // If we already have an uploaded video, use it
        if (uploadedVideoUrl) {
          videoRef.current.src = uploadedVideoUrl;
          videoRef.current.loop = true;
          videoRef.current.play().catch(console.error);
        } else {
          videoRef.current.src = "";
        }
      }
      setError(null);
    } else {
      // Clear any uploaded video URL when switching to real camera
      if (videoRef.current) {
        videoRef.current.src = "";
      }

      // Use real camera
      const initCamera = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: selectedDeviceId } },
            audio: false,
          });

          streamRef.current = stream;

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }

          setError(null);
        } catch (err) {
          console.error("Error accessing camera:", err);
          setError("Failed to access camera. Please check permissions.");
        }
      };

      initCamera();
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [selectedDeviceId, uploadedVideoUrl]);

  // Capture a single frame from the video as a Blob
  const captureFrame = useCallback((): { blob: Blob; dataUrl: string } | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.readyState < 2) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);

    // Convert dataUrl to Blob
    const byteString = atob(dataUrl.split(",")[1]);
    const mimeString = dataUrl.split(",")[0].split(":")[1].split(";")[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: mimeString });

    return { blob, dataUrl };
  }, []);

  // Send frame to API for pHash comparison
  const checkImage = useCallback(async (blob: Blob) => {
    const formData = new FormData();
    formData.append("image", blob, "frame.jpg");

    const res = await fetch("/api/check-image", { method: "POST", body: formData });
    const data = await res.json();
    return data as { shouldProcess: boolean; distance: number | null; message: string };
  }, []);

  // Sequential capture loop
  const startCaptureLoop = useCallback(async () => {
    // Reset hash cache on server
    await fetch("/api/check-image", { method: "DELETE" });

    const startTime = Date.now();
    let accepted = 0;
    let skipped = 0;
    let checked = 0;

    addLog("Capture started", "info");
    setStatusText("Starting capture...");

    while (capturingRef.current && accepted < MAX_FRAMES) {
      // Timeout check
      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed >= TIMEOUT_SECONDS) {
        addLog(
          `Timeout reached (${TIMEOUT_SECONDS}s). Collected ${accepted}/${MAX_FRAMES} frames.`,
          "info"
        );
        break;
      }

      setStatusText(
        `Capturing... ${accepted}/${MAX_FRAMES} accepted, ${skipped} skipped (${Math.round(
          TIMEOUT_SECONDS - elapsed
        )}s left)`
      );

      const frame = captureFrame();
      if (!frame) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }

      checked++;
      setCheckedCount(checked);

      try {
        const result = await checkImage(frame.blob);

        if (result.shouldProcess) {
          accepted++;
          const timestamp = getTimestamp();
          setFrames((prev) => [...prev, { src: frame.dataUrl, timestamp }]);
          addLog(`Frame ${accepted} accepted — ${result.message}`, "accepted");
        } else {
          skipped++;
          setSkippedCount(skipped);
          addLog(`Frame skipped — ${result.message}`, "skipped");
        }
      } catch (err) {
        addLog(`API error: ${err}`, "error");
      }

      // Wait 0.5s before next capture
      await new Promise((r) => setTimeout(r, 1000));
    }

    capturingRef.current = false;
    setCapturing(false);
    setStatusText(
      accepted >= MAX_FRAMES
        ? `✅ Batch complete! ${accepted} frames captured.`
        : `⏱️ Capture ended. ${accepted}/${MAX_FRAMES} frames collected.`
    );

    if (accepted > 0) {
      addLog("Batch complete — generating grid...", "info");
    }
  }, [captureFrame, checkImage, addLog]);

  // Analyze frames with Gemini
  const analyzeGrid = useCallback(async (capturedFrames: CapturedFrame[]) => {
    if (capturedFrames.length === 0) return;

    setAnalyzing(true);
    setAnalysisResult(null);
    addLog("Sending frames to Gemini for analysis...", "info");
    setStatusText("🔍 Analyzing frames with AI...");

    try {
      const res = await fetch("/api/analyze-grid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: capturedFrames.map((f) => f.src),
          timestamps: capturedFrames.map((f) => f.timestamp),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Analysis request failed");
      }

      const result: AnalysisResult = await res.json();
      setAnalysisResult(result);
      setCumulativeScore(result.cumulativeScore);
      addLog(`Analysis complete — Batch #${result.batchNumber}`, "accepted");
      addLog(`CO2: ${result.totalCO2Kg} kg | Score Δ: ${result.scoreChange}%`, "info");
      setStatusText(`✅ Analysis complete — Batch #${result.batchNumber}`);
    } catch (err) {
      addLog(`Analysis failed: ${err}`, "error");
      setStatusText("❌ Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }, [addLog]);

  // Download grid and trigger analysis when capture finishes
  useEffect(() => {
    if (capturing || frames.length === 0) return;
    // Only auto-download when we've stopped capturing
    if (statusText.startsWith("✅") || statusText.startsWith("⏱️")) {
      downloadGrid();
      analyzeGrid(frames);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing, statusText]);

  const downloadGrid = useCallback(() => {
    const gridCanvas = gridCanvasRef.current;
    if (!gridCanvas || frames.length === 0) return;

    const cols = 4;
    const rows = 3;

    const images = frames.map((f) => {
      const img = new Image();
      img.src = f.src;
      return { img, timestamp: f.timestamp };
    });

    Promise.all(
      images.map(
        ({ img }) =>
          new Promise<HTMLImageElement>((resolve) => {
            if (img.complete) resolve(img);
            else img.onload = () => resolve(img);
          })
      )
    ).then((loadedImages) => {
      const cellW = loadedImages[0].width;
      const cellH = loadedImages[0].height;
      gridCanvas.width = cellW * cols;
      gridCanvas.height = cellH * rows;

      const ctx = gridCanvas.getContext("2d");
      if (!ctx) return;

      // Fill background black for any missing cells
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, gridCanvas.width, gridCanvas.height);

      loadedImages.forEach((img, i) => {
        const x = (i % cols) * cellW;
        const y = Math.floor(i / cols) * cellH;
        ctx.drawImage(img, x, y, cellW, cellH);

        // Draw label: "N HH:MM:SS"
        const label = `${i + 1} ${frames[i].timestamp}`;
        const size = Math.max(20, Math.round(cellW * 0.04));
        const padding = Math.round(size * 0.4);
        ctx.font = `bold ${size}px monospace`;
        const textWidth = ctx.measureText(label).width;

        // Background pill
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.beginPath();
        ctx.roundRect(
          x + padding,
          y + padding,
          textWidth + size,
          size * 1.6,
          size * 0.25
        );
        ctx.fill();

        // Text
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(label, x + padding + size * 0.5, y + padding + size * 0.8);
      });

      const link = document.createElement("a");
      link.download = "capture-grid.jpg";
      link.href = gridCanvas.toDataURL("image/jpeg", 0.9);
      link.click();

      console.log("Batch complete");
    });
  }, [frames]);

  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedDeviceId(e.target.value);
  };

  const handleStartCapture = () => {
    setFrames([]);
    setLog([]);
    setSkippedCount(0);
    setCheckedCount(0);
    setAnalysisResult(null);
    setCapturing(true);
    capturingRef.current = true;
    startCaptureLoop();
  };

  const handleStopCapture = () => {
    capturingRef.current = false;
  };

  return (
    <div className="capture-session">
      {error && <p className="error-message">{error}</p>}

      <canvas ref={canvasRef} style={{ display: "none" }} />
      <canvas ref={gridCanvasRef} style={{ display: "none" }} />
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onChange={handleVideoUpload}
        style={{ display: "none" }}
      />

      <div className="layout-container">
        {/* Left Column: Camera + Controls */}
        <div className="left-column">
          <div className="device-selector">
            <label htmlFor="camera-select">Select Source:</label>
            <select
              id="camera-select"
              value={selectedDeviceId}
              onChange={handleDeviceChange}
              className="camera-dropdown"
            >
              {devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
          </div>

          {selectedDeviceId === TEST_DEVICE_ID && (
            <div className="upload-area">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="upload-btn"
              >
                📁 Choose Video File
              </button>
              {uploadedVideoUrl && (
                <span className="upload-status">✓ Video loaded</span>
              )}
              {!uploadedVideoUrl && (
                <span className="upload-hint">Select a video file to analyze</span>
              )}
            </div>
          )}

          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="video-feed"
          />

          <div className="capture-controls">
            {!capturing ? (
              <button onClick={handleStartCapture} className="capture-btn">
                {frames.length > 0 ? "Restart Capture" : "Start Capturing"}
              </button>
            ) : (
              <button onClick={handleStopCapture} className="capture-btn stop-btn">
                Stop Capture
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Grid Preview + Activity Log */}
        <div className="right-column">
          <div className="grid-preview">
            <h3>Captured Frames ({frames.length}/{MAX_FRAMES})</h3>
            <div className="grid">
              {Array.from({ length: MAX_FRAMES }).map((_, i) => (
                <div key={i} className="grid-cell">
                  {frames[i] ? (
                    <>
                      <img src={frames[i].src} alt={`Frame ${i + 1}`} />
                      <span className="grid-label">
                        {i + 1} {frames[i].timestamp}
                      </span>
                    </>
                  ) : (
                    <div className="grid-placeholder">
                      <span>{i + 1}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Status and Progress */}
          <div className="status-section">
            <p className="status-text">{statusText || "Ready to capture"}</p>

            <div className="progress-bar-container">
              <div
                className="progress-bar-fill"
                style={{ width: `${(frames.length / MAX_FRAMES) * 100}%` }}
              />
            </div>

            <div className="stats">
              <span className="stat accepted">✓ {frames.length}</span>
              <span className="stat skipped">✗ {skippedCount}</span>
              <span className="stat checked">⊘ {checkedCount}</span>
            </div>
          </div>

          {/* Analysis Results */}
          {(analyzing || analysisResult) && (
            <div className="analysis-panel">
              <h3>🌍 Carbon Footprint Analysis</h3>

              {analyzing && (
                <div className="analysis-loading">
                  <div className="spinner" />
                  <p>Analyzing frames with Gemini AI...</p>
                </div>
              )}

              {analysisResult && (
                <div className="analysis-content">
                  {/* Score Overview */}
                  <div className="score-overview">
                    <div className="score-card batch-score">
                      <span className="score-label">Batch Score Change</span>
                      <span className="score-value">
                        {analysisResult.scoreChange > 0 ? "+" : ""}
                        {analysisResult.scoreChange}%
                      </span>
                      <span className="score-detail">
                        {analysisResult.totalCO2Kg} kg CO₂
                      </span>
                    </div>
                    <div className="score-card cumulative-score">
                      <span className="score-label">Cumulative Score</span>
                      <span className="score-value">
                        {cumulativeScore > 0 ? "+" : ""}
                        {cumulativeScore}%
                      </span>
                      <span className="score-detail">
                        of daily avg (12.85 kg)
                      </span>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="analysis-summary">
                    <h4>Summary</h4>
                    <p>{analysisResult.summary}</p>
                  </div>

                  {/* Activities */}
                  {analysisResult.activities.length > 0 && (
                    <div className="activities-table">
                      <h4>Detected Activities</h4>
                      <table>
                        <thead>
                          <tr>
                            <th>Activity</th>
                            <th>Quantity</th>
                            <th>CO₂ (kg)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analysisResult.activities.map((act, i) => (
                            <tr key={i}>
                              <td>{act.activity}</td>
                              <td>{act.estimatedQuantity}</td>
                              <td className={act.co2Kg > 0 ? "emission-positive" : "emission-zero"}>
                                {act.co2Kg > 0 ? "+" : ""}{act.co2Kg}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Timestamps */}
                  <div className="analysis-timestamps">
                    <h4>Frame Timestamps</h4>
                    <div className="timestamp-chips">
                      {analysisResult.timestamps.map((ts, i) => (
                        <span key={i} className="timestamp-chip">
                          {i + 1}: {ts}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Activity log */}
          <div className="log-container">
            <h4>Activity Log</h4>
            <div className="log-entries">
              {log.length === 0 ? (
                <div className="log-empty">No activity yet</div>
              ) : (
                log.slice(0, 50).map((entry, i) => (
                  <div key={i} className={`log-entry log-${entry.type}`}>
                    <span className="log-time">{entry.time}</span>
                    <span className="log-msg">{entry.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .capture-session {
          height: 100vh;
          padding: 1rem;
          background-color: #f9fafb;
          box-sizing: border-box;
          overflow: hidden;
        }

        .layout-container {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          max-width: 1600px;
          margin: 0 auto;
          height: 100%;
        }

        .left-column {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          height: 100%;
          min-height: 0;
        }

        .right-column {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          height: 100%;
          min-height: 0;
          overflow-y: auto;
        }

        .device-selector {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          flex-shrink: 0;
        }

        .device-selector label {
          font-size: 0.9rem;
          font-weight: 500;
          color: #374151;
        }

        .camera-dropdown {
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
          border: 1px solid #d1d5db;
          font-size: 0.9rem;
          cursor: pointer;
          background-color: white;
        }

        .camera-dropdown:hover {
          border-color: #9ca3af;
        }

        .camera-dropdown:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .upload-area {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-shrink: 0;
          padding: 0.5rem 0;
        }

        .upload-btn {
          padding: 0.5rem 1rem;
          border-radius: 8px;
          border: 2px dashed #3b82f6;
          background: #eff6ff;
          color: #1d4ed8;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .upload-btn:hover {
          background: #dbeafe;
          border-color: #2563eb;
        }

        .upload-status {
          font-size: 0.85rem;
          color: #059669;
          font-weight: 500;
        }

        .upload-hint {
          font-size: 0.8rem;
          color: #9ca3af;
        }

        .video-feed {
          width: 100%;
          flex: 1;
          min-height: 0;
          object-fit: contain;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          background-color: #000;
        }

        .capture-controls {
          flex-shrink: 0;
          padding: 0.75rem 1rem;
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .capture-btn {
          width: 100%;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          border: none;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          background-color: #3b82f6;
          color: white;
          transition: background-color 0.2s;
        }

        .capture-btn:hover {
          background-color: #2563eb;
        }

        .stop-btn {
          background-color: #ef4444;
        }

        .stop-btn:hover {
          background-color: #dc2626;
        }

        .grid-preview {
          flex-shrink: 0;
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          padding: 1rem;
        }

        .grid-preview h3 {
          margin: 0 0 0.75rem 0;
          font-size: 1rem;
          color: #374151;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
        }

        .grid-cell {
          position: relative;
          aspect-ratio: 4 / 3;
          border-radius: 6px;
          overflow: hidden;
          background-color: #1f2937;
        }

        .grid-cell img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .grid-label {
          position: absolute;
          top: 3px;
          left: 3px;
          background: rgba(0, 0, 0, 0.7);
          color: white;
          font-size: 0.6rem;
          font-family: monospace;
          padding: 1px 5px;
          border-radius: 3px;
          font-weight: bold;
        }

        .grid-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #6b7280;
          font-size: 1.2rem;
          font-weight: 600;
        }

        .status-section {
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 0.6rem 1rem;
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .status-text {
          font-size: 0.85rem;
          color: #6b7280;
          margin: 0;
          text-align: center;
          min-height: 20px;
        }

        .progress-bar-container {
          width: 100%;
          height: 6px;
          background-color: #e5e7eb;
          border-radius: 4px;
          overflow: hidden;
        }

        .progress-bar-fill {
          height: 100%;
          background-color: #3b82f6;
          border-radius: 4px;
          transition: width 0.3s ease;
        }

        .stats {
          display: flex;
          justify-content: center;
          gap: 0.75rem;
          font-size: 0.8rem;
        }

        .stat {
          padding: 0.2rem 0.6rem;
          border-radius: 999px;
          font-weight: 500;
        }

        .stat.accepted {
          background-color: #dcfce7;
          color: #166534;
        }

        .stat.skipped {
          background-color: #fef3c7;
          color: #92400e;
        }

        .stat.checked {
          background-color: #e0e7ff;
          color: #3730a3;
        }

        .log-container {
          display: flex;
          flex-direction: column;
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          padding: 0.75rem 1rem;
          flex: 1;
          min-height: 0;
        }

        .log-container h4 {
          margin: 0 0 0.5rem 0;
          font-size: 0.85rem;
          color: #374151;
          flex-shrink: 0;
        }

        .log-entries {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          font-size: 0.7rem;
          font-family: monospace;
          background: #fafafa;
        }

        .log-empty {
          padding: 1.5rem;
          text-align: center;
          color: #9ca3af;
          font-size: 0.8rem;
        }

        .log-entry {
          display: flex;
          gap: 0.5rem;
          padding: 3px 8px;
          border-bottom: 1px solid #f3f4f6;
        }

        .log-entry:last-child {
          border-bottom: none;
        }

        .log-time {
          color: #9ca3af;
          white-space: nowrap;
        }

        .log-msg {
          flex: 1;
        }

        .log-accepted .log-msg {
          color: #16a34a;
        }

        .log-skipped .log-msg {
          color: #d97706;
        }

        .log-error .log-msg {
          color: #ef4444;
        }

        .log-info .log-msg {
          color: #6b7280;
        }

        .error-message {
          color: #ef4444;
          background-color: #fee;
          padding: 0.75rem;
          border-radius: 8px;
          margin-bottom: 0.5rem;
          text-align: center;
        }

        /* Analysis Panel */
        .analysis-panel {
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          padding: 1rem;
          flex-shrink: 0;
          border: 2px solid #d1fae5;
        }

        .analysis-panel h3 {
          margin: 0 0 0.75rem 0;
          font-size: 1rem;
          color: #065f46;
        }

        .analysis-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          padding: 1.5rem;
          color: #6b7280;
        }

        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid #e5e7eb;
          border-top: 3px solid #3b82f6;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .analysis-content {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .score-overview {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
        }

        .score-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0.75rem;
          border-radius: 10px;
          text-align: center;
        }

        .batch-score {
          background: #fef3c7;
          border: 1px solid #fde68a;
        }

        .cumulative-score {
          background: #ede9fe;
          border: 1px solid #ddd6fe;
        }

        .score-label {
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6b7280;
          margin-bottom: 0.25rem;
        }

        .score-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: #1f2937;
        }

        .score-detail {
          font-size: 0.75rem;
          color: #9ca3af;
          margin-top: 0.15rem;
        }

        .analysis-summary {
          background: #f0fdf4;
          border-radius: 8px;
          padding: 0.75rem;
        }

        .analysis-summary h4 {
          margin: 0 0 0.4rem 0;
          font-size: 0.8rem;
          color: #065f46;
        }

        .analysis-summary p {
          margin: 0;
          font-size: 0.85rem;
          color: #374151;
          line-height: 1.5;
        }

        .activities-table h4 {
          margin: 0 0 0.4rem 0;
          font-size: 0.8rem;
          color: #374151;
        }

        .activities-table table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.8rem;
        }

        .activities-table th {
          text-align: left;
          padding: 0.4rem 0.5rem;
          background: #f9fafb;
          border-bottom: 2px solid #e5e7eb;
          font-weight: 600;
          color: #6b7280;
          font-size: 0.7rem;
          text-transform: uppercase;
        }

        .activities-table td {
          padding: 0.4rem 0.5rem;
          border-bottom: 1px solid #f3f4f6;
          color: #374151;
        }

        .emission-positive {
          color: #dc2626;
          font-weight: 600;
        }

        .emission-zero {
          color: #059669;
          font-weight: 600;
        }

        .analysis-timestamps h4 {
          margin: 0 0 0.4rem 0;
          font-size: 0.8rem;
          color: #374151;
        }

        .timestamp-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
        }

        .timestamp-chip {
          font-size: 0.65rem;
          font-family: monospace;
          background: #f3f4f6;
          color: #6b7280;
          padding: 0.2rem 0.5rem;
          border-radius: 999px;
          border: 1px solid #e5e7eb;
        }

        @media (max-width: 1024px) {
          .capture-session {
            height: auto;
            min-height: 100vh;
            overflow: auto;
          }
          .layout-container {
            grid-template-columns: 1fr;
            height: auto;
          }
          .left-column,
          .right-column {
            height: auto;
          }
          .video-feed {
            flex: none;
            height: auto;
          }
          .log-container {
            flex: none;
            height: 200px;
          }
        }
      `}</style>
    </div>
  );
}
