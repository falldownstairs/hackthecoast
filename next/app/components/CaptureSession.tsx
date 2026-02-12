"use client";

import { useRef, useEffect, useState, useCallback } from "react";

// ============ TYPES ============
interface VideoDevice {
  deviceId: string;
  label: string;
}

interface CapturedFrame {
  src: string;
  timestamp: string;
}

interface LogEntry {
  time: string;
  message: string;
  type: "accepted" | "skipped" | "info" | "error" | "analysis";
}

interface GridJob {
  id: number;
  frames: CapturedFrame[];
  startTime: string;
  endTime: string;
  status: "pending" | "analyzing" | "complete" | "failed";
  result?: { cumulativeScore: number };
  error?: string;
}

// ============ CONSTANTS ============
const MAX_FRAMES = 12;
const MAX_PENDING_JOBS = 3;
const TEST_DEVICE_ID = "__upload-video__";

function getTimestamp(): string {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// ============ COMPONENT ============
export default function CaptureSession() {
  // Refs for DOM elements
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Refs for mutable state that doesn't need re-renders
  const streamRef = useRef<MediaStream | null>(null);
  const sessionActiveRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const jobIdCounterRef = useRef(0);
  const analysisQueueRef = useRef<GridJob[]>([]);
  const processingRef = useRef(false);

  // UI State
  const [devices, setDevices] = useState<VideoDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Capture state
  const [currentFrames, setCurrentFrames] = useState<CapturedFrame[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [statusText, setStatusText] = useState("Ready to capture");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [checkedCount, setCheckedCount] = useState(0);
  const [completedGrids, setCompletedGrids] = useState(0);

  // Analysis queue state (for UI)
  const [analysisQueue, setAnalysisQueue] = useState<GridJob[]>([]);

  // ============ HELPERS ============
  const addLog = useCallback((message: string, type: LogEntry["type"] = "info") => {
    setLog((prev) => [{ time: getTimestamp(), message, type }, ...prev].slice(0, 100));
  }, []);

  // ============ DEVICE ENUMERATION ============
  useEffect(() => {
    let mounted = true;
    const getDevices = async () => {
      try {
        const deviceList = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = deviceList
          .filter((d) => d.kind === "videoinput")
          .map((d) => ({
            deviceId: d.deviceId,
            label: d.label || `Camera ${d.deviceId.slice(0, 8)}`,
          }));

        const allDevices: VideoDevice[] = [
          { deviceId: TEST_DEVICE_ID, label: "📁 Upload Video (no camera)" },
          ...videoDevices,
        ];

        if (mounted) {
          setDevices(allDevices);
          if (!selectedDeviceId) {
            setSelectedDeviceId(allDevices[0].deviceId);
          }
        }
      } catch (err) {
        console.error("Error enumerating devices:", err);
      }
    };
    getDevices();
    return () => { mounted = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ============ CAMERA/VIDEO SETUP ============
  useEffect(() => {
    if (!selectedDeviceId) return;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (selectedDeviceId === TEST_DEVICE_ID) {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        if (uploadedVideoUrl) {
          videoRef.current.src = uploadedVideoUrl;
          videoRef.current.loop = true;
          videoRef.current.play().catch(() => {});
        } else {
          videoRef.current.src = "";
        }
      }
      setError(null);
    } else {
      if (videoRef.current) videoRef.current.src = "";

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
          console.error("Camera error:", err);
          setError("Failed to access camera. Check permissions.");
        }
      };
      initCamera();
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [selectedDeviceId, uploadedVideoUrl]);

  // ============ VIDEO UPLOAD HANDLER ============
  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (uploadedVideoUrl) URL.revokeObjectURL(uploadedVideoUrl);

    const url = URL.createObjectURL(file);
    setUploadedVideoUrl(url);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = url;
      videoRef.current.loop = true;
      videoRef.current.play().catch(() => {});
      setError(null);
    }

    addLog(`Video loaded: ${file.name}`, "info");
  };

  // ============ FRAME CAPTURE ============
  const captureOneFrame = (): { blob: Blob; dataUrl: string } | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);

    const byteString = atob(dataUrl.split(",")[1]);
    const mimeType = dataUrl.split(",")[0].split(":")[1].split(";")[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return { blob: new Blob([ab], { type: mimeType }), dataUrl };
  };

  // ============ API CALLS ============
  const checkImageSimilarity = async (blob: Blob) => {
    const formData = new FormData();
    formData.append("image", blob, "frame.jpg");
    const res = await fetch("/api/check-image", { method: "POST", body: formData });
    return res.json() as Promise<{ shouldProcess: boolean; distance: number | null; message: string }>;
  };

  const runAnalysis = async (gridDataUrl: string, startTime: string, endTime: string) => {
    const res = await fetch("/api/analyze-grid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gridImage: gridDataUrl, startTime, endTime }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Analysis failed");
    }
    return res.json() as Promise<{ success: boolean; cumulativeScore: number }>;
  };

  // ============ GRID CREATION ============
  const createGridDataUrl = async (framesToDraw: CapturedFrame[]): Promise<string | null> => {
    const gridCanvas = gridCanvasRef.current;
    if (!gridCanvas || framesToDraw.length === 0) return null;

    const cols = 4;
    const rows = 3;
    const images = framesToDraw.map((f) => {
      const img = new Image();
      img.src = f.src;
      return { img, timestamp: f.timestamp };
    });

    const loadedImages = await Promise.all(
      images.map(
        ({ img }) =>
          new Promise<HTMLImageElement>((resolve) => {
            if (img.complete) resolve(img);
            else img.onload = () => resolve(img);
          })
      )
    );

    const cellW = loadedImages[0].width;
    const cellH = loadedImages[0].height;
    gridCanvas.width = cellW * cols;
    gridCanvas.height = cellH * rows;

    const ctx = gridCanvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, gridCanvas.width, gridCanvas.height);

    loadedImages.forEach((img, i) => {
      const x = (i % cols) * cellW;
      const y = Math.floor(i / cols) * cellH;
      ctx.drawImage(img, x, y, cellW, cellH);

      const label = `${i + 1} ${framesToDraw[i].timestamp}`;
      const size = Math.max(20, Math.round(cellW * 0.04));
      const padding = Math.round(size * 0.4);
      ctx.font = `bold ${size}px monospace`;
      const textWidth = ctx.measureText(label).width;

      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.beginPath();
      ctx.roundRect(x + padding, y + padding, textWidth + size, size * 1.6, size * 0.25);
      ctx.fill();

      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + padding + size * 0.5, y + padding + size * 0.8);
    });

    return gridCanvas.toDataURL("image/jpeg", 0.9);
  };

  // ============ ANALYSIS QUEUE PROCESSOR ============
  const processAnalysisQueue = useCallback(async () => {
    if (processingRef.current) return;
    
    const pendingJob = analysisQueueRef.current.find(j => j.status === "pending");
    if (!pendingJob) return;

    processingRef.current = true;

    // Update job status to analyzing
    pendingJob.status = "analyzing";
    setAnalysisQueue([...analysisQueueRef.current]);

    try {
      const gridDataUrl = await createGridDataUrl(pendingJob.frames);
      if (!gridDataUrl) throw new Error("Failed to create grid");

      const result = await runAnalysis(gridDataUrl, pendingJob.startTime, pendingJob.endTime);
      
      pendingJob.status = "complete";
      pendingJob.result = result;
      addLog(`Grid #${pendingJob.id} analyzed. Score: ${result.cumulativeScore}%`, "analysis");
      setCompletedGrids(prev => prev + 1);
    } catch (err) {
      pendingJob.status = "failed";
      pendingJob.error = err instanceof Error ? err.message : String(err);
      addLog(`Grid #${pendingJob.id} failed: ${pendingJob.error}`, "error");
    }

    setAnalysisQueue([...analysisQueueRef.current]);
    processingRef.current = false;

    // Remove completed/failed jobs older than the last 5
    const activeJobs = analysisQueueRef.current.filter(j => j.status === "pending" || j.status === "analyzing");
    const finishedJobs = analysisQueueRef.current.filter(j => j.status === "complete" || j.status === "failed");
    analysisQueueRef.current = [...activeJobs, ...finishedJobs.slice(-5)];
    setAnalysisQueue([...analysisQueueRef.current]);

    // Process next job if any
    processAnalysisQueue();
  }, [addLog]);

  // ============ QUEUE A GRID FOR ANALYSIS ============
  const queueGridForAnalysis = useCallback((frames: CapturedFrame[], startTime: string, endTime: string) => {
    const pendingCount = analysisQueueRef.current.filter(j => j.status === "pending" || j.status === "analyzing").length;
    
    if (pendingCount >= MAX_PENDING_JOBS) {
      addLog(`Queue full (${MAX_PENDING_JOBS} pending). Waiting...`, "info");
      return false;
    }

    jobIdCounterRef.current++;
    const job: GridJob = {
      id: jobIdCounterRef.current,
      frames: [...frames],
      startTime,
      endTime,
      status: "pending",
    };

    analysisQueueRef.current.push(job);
    setAnalysisQueue([...analysisQueueRef.current]);
    addLog(`Grid #${job.id} queued for analysis`, "info");

    // Start processing if not already
    processAnalysisQueue();
    return true;
  }, [addLog, processAnalysisQueue]);

  // ============ MAIN CONTINUOUS CAPTURE SESSION ============
  const runCaptureSession = async () => {
    if (sessionActiveRef.current) {
      console.warn("Session already active, ignoring");
      return;
    }

    sessionActiveRef.current = true;
    stopRequestedRef.current = false;

    // Reset UI state
    setCurrentFrames([]);
    setLog([]);
    setSkippedCount(0);
    setCheckedCount(0);
    setCompletedGrids(0);
    setCapturing(true);
    setStatusText("Starting continuous capture...");

    // Reset server-side hash cache
    await fetch("/api/check-image", { method: "DELETE" });

    addLog("Continuous capture started", "info");

    let gridNumber = 0;
    let totalSkipped = 0;
    let totalChecked = 0;

    // Continuous capture loop
    while (!stopRequestedRef.current) {
      gridNumber++;
      const gridStartTime = getTimestamp();
      let accepted = 0;
      const collectedFrames: CapturedFrame[] = [];

      addLog(`Starting grid #${gridNumber}...`, "info");

      // Capture 12 frames for this grid
      while (!stopRequestedRef.current && accepted < MAX_FRAMES) {
        // Check if queue is full - wait if so
        const pendingCount = analysisQueueRef.current.filter(j => j.status === "pending" || j.status === "analyzing").length;
        if (pendingCount >= MAX_PENDING_JOBS && accepted === 0) {
          setStatusText(`Queue full (${pendingCount}/${MAX_PENDING_JOBS}). Waiting...`);
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }

        setStatusText(
          `Grid #${gridNumber}: ${accepted}/${MAX_FRAMES} frames | ${totalSkipped} skipped | Queue: ${pendingCount}/${MAX_PENDING_JOBS}`
        );

        const frame = captureOneFrame();
        if (!frame) {
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }

        totalChecked++;
        setCheckedCount(totalChecked);

        try {
          const result = await checkImageSimilarity(frame.blob);

          if (result.shouldProcess) {
            accepted++;
            const timestamp = getTimestamp();
            const capturedFrame = { src: frame.dataUrl, timestamp };
            collectedFrames.push(capturedFrame);
            setCurrentFrames([...collectedFrames]);
            addLog(`Grid #${gridNumber} frame ${accepted} — ${result.message}`, "accepted");
          } else {
            totalSkipped++;
            setSkippedCount(totalSkipped);
            addLog(`Frame skipped — ${result.message}`, "skipped");
          }
        } catch (err) {
          addLog(`API error: ${err}`, "error");
        }

        await new Promise((r) => setTimeout(r, 1000));
      }

      // Check if we should discard this grid (user stopped mid-capture)
      if (stopRequestedRef.current && collectedFrames.length < MAX_FRAMES) {
        addLog(`Grid #${gridNumber} discarded (${collectedFrames.length}/${MAX_FRAMES} frames)`, "info");
        break;
      }

      // Queue completed grid for analysis
      if (collectedFrames.length === MAX_FRAMES) {
        const gridEndTime = getTimestamp();
        queueGridForAnalysis(collectedFrames, gridStartTime, gridEndTime);
        
        // Clear current frames for next grid
        setCurrentFrames([]);
        
        // Reset hash cache for new grid
        await fetch("/api/check-image", { method: "DELETE" });
      }
    }

    setCapturing(false);
    setStatusText("Capture stopped. Waiting for pending analyses...");
    addLog("Capture stopped", "info");

    sessionActiveRef.current = false;
  };

  // ============ BUTTON HANDLERS ============
  const handleStartCapture = () => {
    runCaptureSession();
  };

  const handleStopCapture = () => {
    stopRequestedRef.current = true;
    addLog("Stop requested...", "info");
  };

  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedDeviceId(e.target.value);
  };

  // ============ RENDER ============
  const pendingJobs = analysisQueue.filter(j => j.status === "pending" || j.status === "analyzing");

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
        {/* Left Column */}
        <div className="left-column">
          <div className="device-selector">
            <label htmlFor="camera-select">Select Source:</label>
            <select
              id="camera-select"
              value={selectedDeviceId}
              onChange={handleDeviceChange}
              className="camera-dropdown"
              disabled={capturing}
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
              <button onClick={() => fileInputRef.current?.click()} className="upload-btn" disabled={capturing}>
                📁 Choose Video File
              </button>
              {uploadedVideoUrl ? (
                <span className="upload-status">✓ Video loaded</span>
              ) : (
                <span className="upload-hint">Select a video file to analyze</span>
              )}
            </div>
          )}

          <video ref={videoRef} autoPlay playsInline muted className="video-feed" />

          <div className="capture-controls">
            {!capturing ? (
              <button onClick={handleStartCapture} className="capture-btn">
                ▶ Start Continuous Capture
              </button>
            ) : (
              <button onClick={handleStopCapture} className="capture-btn stop-btn">
                ⏹ Stop Capture
              </button>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="right-column">
          <div className="grid-preview">
            <h3>Current Grid ({currentFrames.length}/{MAX_FRAMES})</h3>
            <div className="grid">
              {Array.from({ length: MAX_FRAMES }).map((_, i) => (
                <div key={i} className="grid-cell">
                  {currentFrames[i] ? (
                    <>
                      <img src={currentFrames[i].src} alt={`Frame ${i + 1}`} />
                      <span className="grid-label">{i + 1} {currentFrames[i].timestamp}</span>
                    </>
                  ) : (
                    <div className="grid-placeholder"><span>{i + 1}</span></div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="status-section">
            <p className="status-text">{statusText}</p>
            <div className="progress-bar-container">
              <div className="progress-bar-fill" style={{ width: `${(currentFrames.length / MAX_FRAMES) * 100}%` }} />
            </div>
            <div className="stats">
              <span className="stat accepted">✓ Grids: {completedGrids}</span>
              <span className="stat skipped">✗ Skipped: {skippedCount}</span>
              <span className="stat checked">⊘ Checked: {checkedCount}</span>
            </div>
          </div>

          {/* Analysis Queue */}
          <div className="queue-container">
            <h4>Analysis Queue ({pendingJobs.length}/{MAX_PENDING_JOBS})</h4>
            <div className="queue-list">
              {analysisQueue.length === 0 ? (
                <div className="queue-empty">No grids in queue</div>
              ) : (
                analysisQueue.slice().reverse().map((job) => (
                  <div key={job.id} className={`queue-item queue-${job.status}`}>
                    <span className="queue-id">Grid #{job.id}</span>
                    <span className="queue-time">{job.startTime} - {job.endTime}</span>
                    <span className="queue-status">
                      {job.status === "pending" && "⏳ Pending"}
                      {job.status === "analyzing" && "🔄 Analyzing..."}
                      {job.status === "complete" && `✅ Score: ${job.result?.cumulativeScore}%`}
                      {job.status === "failed" && "❌ Failed"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

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
        .camera-dropdown:hover { border-color: #9ca3af; }
        .camera-dropdown:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        .camera-dropdown:disabled {
          background-color: #f3f4f6;
          cursor: not-allowed;
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
        .upload-btn:hover:not(:disabled) {
          background: #dbeafe;
          border-color: #2563eb;
        }
        .upload-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .upload-status { font-size: 0.85rem; color: #059669; font-weight: 500; }
        .upload-hint { font-size: 0.8rem; color: #9ca3af; }
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
        .capture-btn:hover { background-color: #2563eb; }
        .stop-btn { background-color: #ef4444; }
        .stop-btn:hover { background-color: #dc2626; }
        .grid-preview {
          flex-shrink: 0;
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          padding: 1rem;
        }
        .grid-preview h3 { margin: 0 0 0.75rem 0; font-size: 1rem; color: #374151; }
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
        .grid-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
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
        .stats { display: flex; justify-content: center; gap: 0.75rem; font-size: 0.8rem; }
        .stat { padding: 0.2rem 0.6rem; border-radius: 999px; font-weight: 500; }
        .stat.accepted { background-color: #dcfce7; color: #166534; }
        .stat.skipped { background-color: #fef3c7; color: #92400e; }
        .stat.checked { background-color: #e0e7ff; color: #3730a3; }
        .queue-container {
          flex-shrink: 0;
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          padding: 0.75rem 1rem;
        }
        .queue-container h4 { margin: 0 0 0.5rem 0; font-size: 0.85rem; color: #374151; }
        .queue-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          max-height: 150px;
          overflow-y: auto;
        }
        .queue-empty {
          text-align: center;
          color: #9ca3af;
          font-size: 0.8rem;
          padding: 1rem;
        }
        .queue-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem 0.75rem;
          border-radius: 8px;
          font-size: 0.8rem;
          background: #f9fafb;
        }
        .queue-pending { background: #fef3c7; }
        .queue-analyzing { background: #dbeafe; }
        .queue-complete { background: #d1fae5; }
        .queue-failed { background: #fee2e2; }
        .queue-id { font-weight: 600; color: #374151; }
        .queue-time { color: #6b7280; font-family: monospace; font-size: 0.75rem; }
        .queue-status { margin-left: auto; font-weight: 500; }
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
        .log-container h4 { margin: 0 0 0.5rem 0; font-size: 0.85rem; color: #374151; flex-shrink: 0; }
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
        .log-empty { padding: 1.5rem; text-align: center; color: #9ca3af; font-size: 0.8rem; }
        .log-entry { display: flex; gap: 0.5rem; padding: 3px 8px; border-bottom: 1px solid #f3f4f6; }
        .log-entry:last-child { border-bottom: none; }
        .log-time { color: #9ca3af; white-space: nowrap; }
        .log-msg { flex: 1; }
        .log-accepted .log-msg { color: #16a34a; }
        .log-skipped .log-msg { color: #d97706; }
        .log-error .log-msg { color: #ef4444; }
        .log-info .log-msg { color: #6b7280; }
        .log-analysis .log-msg { color: #7c3aed; font-weight: 500; }
        .error-message {
          color: #ef4444;
          background-color: #fee;
          padding: 0.75rem;
          border-radius: 8px;
          margin-bottom: 0.5rem;
          text-align: center;
        }
        @media (max-width: 1024px) {
          .capture-session { height: auto; min-height: 100vh; overflow: auto; }
          .layout-container { grid-template-columns: 1fr; height: auto; }
          .left-column, .right-column { height: auto; }
          .video-feed { flex: none; height: auto; }
          .log-container { flex: none; height: 200px; }
        }
      `}</style>
    </div>
  );
}
