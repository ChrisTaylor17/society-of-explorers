'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

type WidgetState = 'idle' | 'uploading' | 'scoring' | 'success' | 'error';

type UploadResponse = {
  success: true;
  scanId: string;
  message: string;
};

type ApiErrorResponse = {
  error: string;
};

type ScanRecord = {
  id: string;
  file_path: string;
  file_size_bytes: number;
  scan_format: string;
  quality_score: number | null;
  exp_awarded: number;
  status: string;
  location_name: string | null;
  created_at: string;
  processed_at: string | null;
};

type MyScansResponse = {
  scans: ScanRecord[];
};

const COLORS = {
  card: 'rgba(17,17,17,0.72)',
  cardAlt: 'rgba(13,13,13,0.76)',
  gold: '#c9a84c',
  muted: '#888',
  parchment: '#f5f0e8',
  border: 'rgba(201,168,76,0.15)',
  borderSoft: 'rgba(201,168,76,0.12)',
  danger: '#d27b6e',
};

const ALLOWED_EXTENSIONS = ['usdz', 'obj', 'ply', 'glb', 'gltf', 'splat', 'e57', 'las', 'laz'];
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 20;

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

export function ScanUploadWidget() {
  const [widgetState, setWidgetState] = useState<WidgetState>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [rewardText, setRewardText] = useState<string>('');
  const [qualityScore, setQualityScore] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const progressIntervalRef = useRef<number | null>(null);
  const pollTimeoutRef = useRef<number | null>(null);

  const clearTimers = useCallback((): void => {
    if (progressIntervalRef.current !== null) { window.clearInterval(progressIntervalRef.current); progressIntervalRef.current = null; }
    if (pollTimeoutRef.current !== null) { window.clearTimeout(pollTimeoutRef.current); pollTimeoutRef.current = null; }
  }, []);

  const startSimulatedProgress = useCallback((): void => {
    const start = Date.now();
    setUploadProgress(0);
    if (progressIntervalRef.current !== null) window.clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = window.setInterval(() => {
      const t = Math.min((Date.now() - start) / 3000, 1);
      const eased = 1 - (1 - t) ** 3;
      setUploadProgress(Math.min(70, eased * 70));
      if (t >= 1 && progressIntervalRef.current !== null) { window.clearInterval(progressIntervalRef.current); progressIntervalRef.current = null; }
    }, 40);
  }, []);

  const validateFile = useCallback((file: File): string | null => {
    const ext = getFileExtension(file.name);
    if (!ALLOWED_EXTENSIONS.includes(ext)) return 'Invalid file type.';
    if (file.size > 500 * 1024 * 1024) return 'File exceeds 500MB.';
    return null;
  }, []);

  const pollForScore = useCallback(async (scanId: string, attempt: number = 0): Promise<void> => {
    if (attempt >= POLL_MAX_ATTEMPTS) {
      setWidgetState('success'); setSuccessMessage('Scoring in progress — check back soon.'); setRewardText('Pending'); setQualityScore(0); return;
    }
    try {
      const res = await fetch('/api/scan/my-scans?limit=50&offset=0', { method: 'GET', credentials: 'include' });
      const payload = (await res.json()) as MyScansResponse | ApiErrorResponse;
      if (!res.ok) { setWidgetState('success'); setSuccessMessage('Scoring in progress — check back soon.'); setRewardText('Pending'); setQualityScore(0); return; }
      const scan = ('scans' in payload ? payload.scans : []).find((e) => e.id === scanId);
      if (scan?.status === 'scored') {
        setWidgetState('success'); setSuccessMessage('Scan recorded in the Explorer archive.'); setRewardText(`+${scan.exp_awarded} $EXP`); setQualityScore(scan.quality_score ?? 0); return;
      }
      pollTimeoutRef.current = window.setTimeout(() => { void pollForScore(scanId, attempt + 1); }, POLL_INTERVAL_MS);
    } catch { setWidgetState('success'); setSuccessMessage('Scoring in progress — check back soon.'); setRewardText('Pending'); setQualityScore(0); }
  }, []);

  const handleUpload = useCallback(async (): Promise<void> => {
    if (!selectedFile) return;
    clearTimers(); setWidgetState('uploading'); setErrorMessage(''); startSimulatedProgress();
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const ext = getFileExtension(selectedFile.name);
      if (ext) formData.append('scan_format', ext);
      const res = await fetch('/api/scan/upload', { method: 'POST', body: formData, credentials: 'include' });
      const payload = (await res.json()) as UploadResponse | ApiErrorResponse;
      setUploadProgress(100);
      if (!res.ok || !('success' in payload)) { setErrorMessage('error' in payload ? payload.error : 'Upload failed.'); setWidgetState('error'); return; }
      setWidgetState('scoring'); void pollForScore(payload.scanId, 0);
    } catch { setErrorMessage('Upload failed.'); setWidgetState('error'); }
  }, [clearTimers, pollForScore, selectedFile, startSimulatedProgress]);

  const resetWidget = useCallback((): void => {
    clearTimers(); setWidgetState('idle'); setSelectedFile(null); setUploadProgress(0); setErrorMessage(''); setSuccessMessage(''); setRewardText(''); setQualityScore(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [clearTimers]);

  useEffect(() => { return () => { clearTimers(); }; }, [clearTimers]);

  const labelStyle: React.CSSProperties = { fontFamily: 'Cinzel, serif', fontSize: '9px', letterSpacing: '0.2em', color: COLORS.gold, textTransform: 'uppercase' };

  return (
    <div style={{ background: COLORS.cardAlt, border: `1px solid ${COLORS.borderSoft}`, borderRadius: '20px', padding: '18px', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', boxShadow: '0 14px 40px rgba(0,0,0,0.24)' }}>
      <style>{`
        @keyframes soeWidgetPulse { 0% { opacity: 0.45; } 50% { opacity: 1; } 100% { opacity: 0.45; } }
        @keyframes soeWidgetSpin { 0% { transform: rotate(45deg); } 100% { transform: rotate(405deg); } }
        @keyframes soeWidgetScaleIn { 0% { opacity: 0; transform: translateY(8px) scale(0.96); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>

      <div style={{ ...labelStyle, marginBottom: '8px' }}>Scan-to-Earn</div>
      <div style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(20px, 5vw, 28px)', color: COLORS.parchment, marginBottom: '10px' }}>Upload a LiDAR scan</div>

      {widgetState === 'idle' && (
        <div style={{ display: 'grid', gap: '12px' }}>
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (!f) return; const err = validateFile(f); if (err) { setErrorMessage(err); setWidgetState('error'); return; } setSelectedFile(f); }}
            onClick={() => fileInputRef.current?.click()}
            style={{ minHeight: '150px', borderRadius: '18px', border: `1px dashed ${isDragging ? 'rgba(201,168,76,0.72)' : 'rgba(201,168,76,0.24)'}`, background: isDragging ? 'rgba(201,168,76,0.06)' : 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '16px', cursor: 'pointer' }}
          >
            <div>
              <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '20px', color: COLORS.parchment }}>Drop your scan file here</div>
              <button type="button" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} style={{ marginTop: '12px', background: 'transparent', color: COLORS.gold, border: '1px solid rgba(201,168,76,0.22)', borderRadius: '12px', height: '42px', padding: '0 16px', fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer' }}>Choose File</button>
              <div style={{ marginTop: '10px', fontFamily: 'Cormorant Garamond, serif', fontSize: '14px', color: COLORS.muted }}>Accepted formats · Max 500MB</div>
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept=".usdz,.obj,.ply,.glb,.gltf,.splat,.e57,.las,.laz" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const err = validateFile(f); if (err) { setErrorMessage(err); setWidgetState('error'); return; } setSelectedFile(f); }} style={{ display: 'none' }} />
          {selectedFile && (
            <div style={{ borderRadius: '14px', border: `1px solid ${COLORS.border}`, background: 'rgba(255,255,255,0.02)', padding: '12px' }}>
              <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '18px', color: COLORS.parchment }}>{selectedFile.name}</div>
              <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '14px', color: COLORS.muted }}>{formatFileSize(selectedFile.size)}</div>
            </div>
          )}
          <button type="button" disabled={!selectedFile} onClick={() => void handleUpload()} style={{ width: '100%', background: selectedFile ? COLORS.gold : 'rgba(201,168,76,0.12)', color: selectedFile ? '#111' : 'rgba(245,240,232,0.45)', border: `1px solid ${selectedFile ? COLORS.gold : 'rgba(201,168,76,0.18)'}`, borderRadius: '14px', height: '46px', fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', cursor: selectedFile ? 'pointer' : 'not-allowed' }}>Upload Scan</button>
        </div>
      )}

      {widgetState === 'uploading' && (
        <div style={{ display: 'grid', gap: '12px' }}>
          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '18px', color: COLORS.parchment }}>Uploading to Explorer Node...</div>
          <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '999px', overflow: 'hidden' }}>
            <div style={{ width: `${uploadProgress}%`, height: '100%', background: COLORS.gold, borderRadius: '999px', transition: 'width 220ms ease-out' }} />
          </div>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: COLORS.gold, animation: 'soeWidgetPulse 1.6s ease-in-out infinite' }}>{Math.round(uploadProgress)}%</div>
        </div>
      )}

      {widgetState === 'scoring' && (
        <div style={{ display: 'grid', gap: '14px', justifyItems: 'center', textAlign: 'center' }}>
          <div style={{ width: '46px', height: '46px', border: '2px solid rgba(201,168,76,0.7)', transform: 'rotate(45deg)', animation: 'soeWidgetSpin 2.2s linear infinite' }} />
          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '18px', color: COLORS.parchment }}>Analyzing scan quality...</div>
        </div>
      )}

      {widgetState === 'success' && (
        <div style={{ display: 'grid', gap: '12px', textAlign: 'center', animation: 'soeWidgetScaleIn 320ms ease-out forwards' }}>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(30px, 8vw, 48px)', color: COLORS.gold }}>{rewardText || 'Success'}</div>
          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: COLORS.parchment }}>{successMessage}</div>
          {qualityScore > 0 && (
            <div style={{ width: '100%', display: 'grid', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={labelStyle}>Quality</span>
                <span style={{ fontFamily: 'Cinzel, serif', fontSize: '18px', color: COLORS.parchment }}>{qualityScore}</span>
              </div>
              <div style={{ width: '100%', height: '7px', background: 'rgba(255,255,255,0.06)', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.max(0, Math.min(100, qualityScore))}%`, height: '100%', background: COLORS.gold, borderRadius: '999px' }} />
              </div>
            </div>
          )}
          <div style={{ display: 'grid', gap: '10px' }}>
            <button type="button" onClick={resetWidget} style={{ background: 'transparent', color: COLORS.gold, border: '1px solid rgba(201,168,76,0.22)', borderRadius: '12px', height: '42px', padding: '0 16px', fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer' }}>Scan Another</button>
            <a href="/scan" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: COLORS.gold, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase' }}>Go to Full Scanner</a>
          </div>
        </div>
      )}

      {widgetState === 'error' && (
        <div style={{ display: 'grid', gap: '12px' }}>
          <div style={{ borderRadius: '14px', border: '1px solid rgba(210,123,110,0.3)', background: 'rgba(210,123,110,0.06)', padding: '14px', fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: COLORS.parchment }}>{errorMessage || 'Upload failed.'}</div>
          <button type="button" onClick={resetWidget} style={{ background: 'transparent', color: COLORS.gold, border: '1px solid rgba(201,168,76,0.22)', borderRadius: '12px', height: '42px', padding: '0 16px', fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer' }}>Try Again</button>
        </div>
      )}
    </div>
  );
}
