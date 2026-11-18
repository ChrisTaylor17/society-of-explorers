'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PublicNav from '@/components/PublicNav';

type UploadState = 'idle' | 'uploading' | 'scoring' | 'success' | 'error';

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
  supabase_path: string;
  file_size_bytes: number;
  scan_format: string;
  quality_score: number | null;
  reward_exp: number;
  status: string;
  location_name: string | null;
  created_at: string;
  verified_at: string | null;
};

type MyScansResponse = {
  scans: ScanRecord[];
};

type ConfettiPiece = {
  id: number;
  left: string;
  size: number;
  duration: number;
  delay: number;
  rotate: number;
  opacity: number;
};

const COLORS = {
  background: '#0a0a0a',
  card: 'rgba(17,17,17,0.72)',
  cardAlt: 'rgba(13,13,13,0.76)',
  gold: '#c9a84c',
  muted: '#888',
  parchment: '#f5f0e8',
  border: 'rgba(201,168,76,0.15)',
  borderSoft: 'rgba(201,168,76,0.12)',
  amber: '#c9984c',
  green: '#7bc47f',
  danger: '#d27b6e',
};

const ALLOWED_EXTENSIONS = ['usdz', 'obj', 'ply', 'glb', 'gltf', 'splat', 'e57', 'las', 'laz'];
const PAGE_LIMIT = 20;
const POLL_MAX_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 3000;

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function formatRelativeTime(dateString: string): string {
  const timestamp = new Date(dateString).getTime();
  if (!Number.isFinite(timestamp)) return 'Unknown time';

  const diff = Date.now() - timestamp;
  const future = diff < 0;
  const absoluteDiff = Math.abs(diff);

  const units: Array<{ ms: number; label: Intl.RelativeTimeFormatUnit }> = [
    { ms: 1000 * 60 * 60 * 24 * 365, label: 'year' },
    { ms: 1000 * 60 * 60 * 24 * 30, label: 'month' },
    { ms: 1000 * 60 * 60 * 24 * 7, label: 'week' },
    { ms: 1000 * 60 * 60 * 24, label: 'day' },
    { ms: 1000 * 60 * 60, label: 'hour' },
    { ms: 1000 * 60, label: 'minute' },
    { ms: 1000, label: 'second' },
  ];

  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  for (const unit of units) {
    if (absoluteDiff >= unit.ms || unit.label === 'second') {
      const value = Math.round(absoluteDiff / unit.ms) * (future ? 1 : -1);
      return formatter.format(value, unit.label);
    }
  }

  return 'just now';
}

function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

function formatTierLabel(tier: string, expAwarded: number, qualityScore: number): string {
  const normalized = tier.trim().toUpperCase();
  if (normalized.includes('FULL')) return 'FULL PROPERTY SCAN';
  if (normalized.includes('DETAILED')) return 'DETAILED SCAN';
  if (normalized.includes('BASIC')) return 'BASIC SCAN';

  if (qualityScore >= 60) return 'FULL PROPERTY SCAN';
  if (qualityScore >= 30) return 'DETAILED SCAN';
  return expAwarded >= 50 ? 'FULL PROPERTY SCAN' : expAwarded >= 25 ? 'DETAILED SCAN' : 'BASIC SCAN';
}

function createConfettiPieces(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    left: `${Math.random() * 100}%`,
    size: 4 + Math.random() * 8,
    duration: 2.2 + Math.random() * 2.2,
    delay: Math.random() * 0.6,
    rotate: Math.random() * 360,
    opacity: 0.45 + Math.random() * 0.55,
  }));
}

export default function ScanPage() {
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [locationName, setLocationName] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [uploadMessage, setUploadMessage] = useState<string>('');
  const [uploadedScanId, setUploadedScanId] = useState<string>('');
  const [scoringMessage, setScoringMessage] = useState<string>('');
  const [scoredScan, setScoredScan] = useState<ScanRecord | null>(null);

  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [scansOffset, setScansOffset] = useState<number>(0);
  const [hasMoreScans, setHasMoreScans] = useState<boolean>(true);
  const [isLoadingScans, setIsLoadingScans] = useState<boolean>(false);
  const [scansError, setScansError] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const progressIntervalRef = useRef<number | null>(null);
  const pollTimeoutRef = useRef<number | null>(null);
  const confettiPiecesRef = useRef<ConfettiPiece[]>(createConfettiPieces(30));

  const successTierLabel = useMemo(() => {
    if (!scoredScan) return '';
    return formatTierLabel(
      scoredScan.quality_score !== null && scoredScan.quality_score >= 60
        ? 'Full Property'
        : scoredScan.quality_score !== null && scoredScan.quality_score >= 30
          ? 'Detailed Scan'
          : 'Basic Scan',
      scoredScan.reward_exp,
      scoredScan.quality_score ?? 0,
    );
  }, [scoredScan]);

  const clearTimers = useCallback((): void => {
    if (progressIntervalRef.current !== null) {
      window.clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    if (pollTimeoutRef.current !== null) {
      window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  const loadScans = useCallback(
    async (offset: number, append: boolean): Promise<void> => {
      setIsLoadingScans(true);
      setScansError('');

      try {
        const response = await fetch(`/api/scan/my-scans?limit=${PAGE_LIMIT}&offset=${offset}`, {
          method: 'GET',
          credentials: 'include',
        });

        const payload = (await response.json()) as MyScansResponse | ApiErrorResponse;

        if (!response.ok) {
          setScansError('error' in payload ? payload.error : 'Failed to load scans.');
          return;
        }

        const nextScans = 'scans' in payload ? payload.scans : [];
        setScans((previous) => (append ? [...previous, ...nextScans] : nextScans));
        setScansOffset(offset + nextScans.length);
        setHasMoreScans(nextScans.length === PAGE_LIMIT);
      } catch (error) {
        console.error('Failed to fetch scans:', error);
        setScansError('Failed to load scans.');
      } finally {
        setIsLoadingScans(false);
      }
    },
    [],
  );

  const startSimulatedProgress = useCallback((): void => {
    const startedAt = Date.now();
    setUploadProgress(0);

    if (progressIntervalRef.current !== null) {
      window.clearInterval(progressIntervalRef.current);
    }

    progressIntervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const duration = 3000;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - t) ** 3;
      const value = Math.min(70, eased * 70);
      setUploadProgress((current) => (current < 70 ? Math.max(current, value) : current));

      if (t >= 1 && progressIntervalRef.current !== null) {
        window.clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }, 40);
  }, []);

  const pollForScore = useCallback(
    async (scanId: string, attempt: number = 0): Promise<void> => {
      if (attempt >= POLL_MAX_ATTEMPTS) {
        setScoringMessage('Scoring in progress — check back soon.');
        await loadScans(0, false);
        return;
      }

      try {
        const response = await fetch('/api/scan/my-scans?limit=50&offset=0', {
          method: 'GET',
          credentials: 'include',
        });

        const payload = (await response.json()) as MyScansResponse | ApiErrorResponse;

        if (!response.ok) {
          setScoringMessage('Scoring in progress — check back soon.');
          return;
        }

        const fetchedScans = 'scans' in payload ? payload.scans : [];
        setScans(fetchedScans);
        setScansOffset(fetchedScans.length);
        setHasMoreScans(fetchedScans.length === PAGE_LIMIT);

        const matchedScan = fetchedScans.find((scan) => scan.id === scanId);

        if (matchedScan?.status === 'scored') {
          setScoredScan(matchedScan);
          setUploadState('success');
          setScoringMessage('');
          return;
        }

        setScoringMessage('Analyzing scan quality...');
        pollTimeoutRef.current = window.setTimeout(() => {
          void pollForScore(scanId, attempt + 1);
        }, POLL_INTERVAL_MS);
      } catch (error) {
        console.error('Polling failed:', error);
        setScoringMessage('Scoring in progress — check back soon.');
      }
    },
    [loadScans],
  );

  const resetUploadState = useCallback((): void => {
    clearTimers();
    setUploadState('idle');
    setSelectedFile(null);
    setUploadProgress(0);
    setErrorMessage('');
    setUploadMessage('');
    setUploadedScanId('');
    setScoringMessage('');
    setScoredScan(null);
    confettiPiecesRef.current = createConfettiPieces(30);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [clearTimers]);

  const validateFile = useCallback((file: File): string | null => {
    const extension = getFileExtension(file.name);
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return 'Invalid file type. Accepted formats: .usdz, .obj, .ply, .glb, .gltf, .splat, .e57, .las, .laz';
    }
    if (file.size > 500 * 1024 * 1024) {
      return 'File exceeds the 500MB limit.';
    }
    return null;
  }, []);

  const handleFileSelected = useCallback(
    (file: File): void => {
      const validationError = validateFile(file);
      if (validationError) {
        setErrorMessage(validationError);
        setUploadState('error');
        return;
      }
      setSelectedFile(file);
      setErrorMessage('');
      if (uploadState === 'error') {
        setUploadState('idle');
      }
    },
    [uploadState, validateFile],
  );

  const handleUpload = useCallback(async (): Promise<void> => {
    if (!selectedFile) return;

    clearTimers();
    setUploadState('uploading');
    setErrorMessage('');
    setUploadMessage('Uploading to Explorer Node...');
    startSimulatedProgress();

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (locationName.trim()) {
        formData.append('location_name', locationName.trim());
      }
      const extension = getFileExtension(selectedFile.name);
      if (extension) {
        formData.append('scan_format', extension);
      }

      const response = await fetch('/api/scan/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      const payload = (await response.json()) as UploadResponse | ApiErrorResponse;
      setUploadProgress(100);

      if (!response.ok || !('success' in payload)) {
        setErrorMessage('error' in payload ? payload.error : 'Upload failed.');
        setUploadState('error');
        return;
      }

      setUploadedScanId(payload.scanId);
      setUploadMessage(payload.message);
      setUploadState('scoring');
      await loadScans(0, false);
      void pollForScore(payload.scanId, 0);
    } catch (error) {
      console.error('Upload failed:', error);
      setErrorMessage('Upload failed.');
      setUploadState('error');
    }
  }, [clearTimers, loadScans, locationName, pollForScore, selectedFile, startSimulatedProgress]);

  useEffect(() => {
    void loadScans(0, false);
    return () => { clearTimers(); };
  }, [clearTimers, loadScans]);

  const panelStyle: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    background: COLORS.cardAlt,
    border: `1px solid ${COLORS.borderSoft}`,
    borderRadius: '22px',
    boxShadow: '0 20px 50px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.02)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    padding: '24px 18px',
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: 'Cinzel, serif',
    fontSize: '9px',
    letterSpacing: '0.2em',
    color: COLORS.gold,
    textTransform: 'uppercase',
  };

  const secondaryButtonStyle: React.CSSProperties = {
    background: 'transparent',
    color: COLORS.gold,
    border: '1px solid rgba(201,168,76,0.22)',
    borderRadius: '14px',
    height: '46px',
    padding: '0 16px',
    fontFamily: 'Cinzel, serif',
    fontSize: '10px',
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  };

  return (
    <div style={{ minHeight: '100vh', background: COLORS.background, color: COLORS.parchment }}>
      <PublicNav />
      <style>{`
        @keyframes soePulse { 0% { opacity: 0.45; } 50% { opacity: 1; } 100% { opacity: 0.45; } }
        @keyframes soeSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes soeScaleIn { 0% { opacity: 0; transform: translateY(10px) scale(0.92); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes soeProgressGlow { 0% { box-shadow: 0 0 0 rgba(201,168,76,0.0); } 50% { box-shadow: 0 0 18px rgba(201,168,76,0.35); } 100% { box-shadow: 0 0 0 rgba(201,168,76,0.0); } }
        @keyframes soeConfettiFall { 0% { transform: translate3d(0,-20px,0) rotate(0deg); opacity: 0; } 10% { opacity: 1; } 100% { transform: translate3d(12px,360px,0) rotate(540deg); opacity: 0; } }
      `}</style>

      <div style={{ width: '100%', maxWidth: '1040px', margin: '0 auto', padding: '80px 16px 80px' }}>
        <section style={{ marginBottom: '28px' }}>
          <div style={labelStyle}>Explorer Capture</div>
          <h1 style={{ margin: '10px 0 12px', fontFamily: 'Cinzel, serif', fontSize: 'clamp(34px, 7vw, 56px)', lineHeight: 1.02, color: COLORS.parchment, fontWeight: 400 }}>
            Scan Your Space
          </h1>
          <p style={{ margin: 0, maxWidth: '760px', fontFamily: 'Cormorant Garamond, serif', fontSize: 'clamp(18px, 3.5vw, 24px)', lineHeight: 1.4, color: 'rgba(245,240,232,0.88)' }}>
            Capture any room with your iPhone&apos;s LiDAR scanner. Upload the file below to earn $EXP and add it to the shared metaverse.
          </p>
        </section>

        <section style={panelStyle}>
          {/* Confetti on success */}
          {uploadState === 'success' && (
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
              {confettiPiecesRef.current.map((piece) => (
                <div key={piece.id} style={{ position: 'absolute', top: '-18px', left: piece.left, width: `${piece.size}px`, height: `${piece.size * 2.4}px`, borderRadius: '999px', background: COLORS.gold, opacity: piece.opacity, transform: `rotate(${piece.rotate}deg)`, animation: `soeConfettiFall ${piece.duration}s linear ${piece.delay}s forwards` }} />
              ))}
            </div>
          )}

          {/* IDLE */}
          {uploadState === 'idle' && (
            <div style={{ display: 'grid', gap: '18px' }}>
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFileSelected(f); }}
                onClick={() => fileInputRef.current?.click()}
                style={{ minHeight: '220px', borderRadius: '20px', border: `1px dashed ${isDragging ? 'rgba(201,168,76,0.75)' : 'rgba(201,168,76,0.28)'}`, background: isDragging ? 'rgba(201,168,76,0.06)' : 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 18px', textAlign: 'center', cursor: 'pointer', transition: 'border-color 180ms ease, background 180ms ease, transform 180ms ease', transform: isDragging ? 'scale(1.01)' : 'scale(1)' }}
              >
                <div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(22px, 5vw, 30px)', color: COLORS.parchment, marginBottom: '12px' }}>Drop your scan file here</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ width: '42px', height: '1px', background: 'rgba(201,168,76,0.16)' }} />
                    <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '18px', color: COLORS.muted }}>or</span>
                    <div style={{ width: '42px', height: '1px', background: 'rgba(201,168,76,0.16)' }} />
                  </div>
                  <button type="button" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} style={{ ...secondaryButtonStyle, minWidth: '172px' }}>Choose File</button>
                  <div style={{ marginTop: '16px', fontFamily: 'Cormorant Garamond, serif', fontSize: '15px', color: COLORS.muted }}>Accepted: .usdz, .obj, .ply, .glb, .gltf, .splat, .e57, .las, .laz · Max 500MB</div>
                </div>
              </div>

              <input ref={fileInputRef} type="file" accept=".usdz,.obj,.ply,.glb,.gltf,.splat,.e57,.las,.laz" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); }} style={{ display: 'none' }} />

              {selectedFile && (
                <div style={{ borderRadius: '16px', border: `1px solid ${COLORS.border}`, background: 'rgba(255,255,255,0.025)', padding: '14px 16px' }}>
                  <div style={{ ...labelStyle, marginBottom: '6px' }}>Selected File</div>
                  <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '18px', color: COLORS.parchment }}>{selectedFile.name}</div>
                  <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '14px', color: COLORS.muted }}>{formatFileSize(selectedFile.size)}</div>
                </div>
              )}

              <div style={{ display: 'grid', gap: '10px' }}>
                <label style={labelStyle}>Location (optional)</label>
                <input type="text" value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="e.g. 92B South St, Boston" style={{ width: '100%', height: '50px', borderRadius: '14px', border: `1px solid ${COLORS.border}`, background: 'rgba(255,255,255,0.03)', color: COLORS.parchment, padding: '0 14px', fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', outline: 'none', boxSizing: 'border-box' }} />
              </div>

              <button type="button" disabled={!selectedFile} onClick={() => void handleUpload()} style={{ width: '100%', background: selectedFile ? COLORS.gold : 'rgba(201,168,76,0.14)', color: selectedFile ? '#111' : 'rgba(245,240,232,0.45)', border: `1px solid ${selectedFile ? COLORS.gold : 'rgba(201,168,76,0.18)'}`, borderRadius: '14px', height: '48px', fontFamily: 'Cinzel, serif', fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', cursor: selectedFile ? 'pointer' : 'not-allowed' }}>Upload Scan</button>
            </div>
          )}

          {/* UPLOADING */}
          {uploadState === 'uploading' && (
            <div style={{ display: 'grid', gap: '18px' }}>
              <div>
                <div style={{ ...labelStyle, marginBottom: '8px' }}>Uploading Scan</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(22px, 5vw, 32px)', color: COLORS.parchment }}>{selectedFile?.name ?? 'Preparing file'}</div>
                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: COLORS.muted }}>{selectedFile ? formatFileSize(selectedFile.size) : ''}</div>
              </div>
              <div style={{ width: '100%', height: '10px', borderRadius: '999px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden', border: '1px solid rgba(201,168,76,0.08)' }}>
                <div style={{ width: `${uploadProgress}%`, height: '100%', borderRadius: '999px', background: COLORS.gold, transition: 'width 220ms ease-out', animation: 'soeProgressGlow 1.8s ease-in-out infinite' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '18px', color: 'rgba(245,240,232,0.9)', animation: 'soePulse 1.8s ease-in-out infinite' }}>Uploading to Explorer Node...</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', color: COLORS.gold }}>{Math.round(uploadProgress)}%</div>
              </div>
            </div>
          )}

          {/* SCORING */}
          {uploadState === 'scoring' && (
            <div style={{ display: 'grid', gap: '18px', justifyItems: 'center', textAlign: 'center' }}>
              <div style={labelStyle}>Scan Analysis</div>
              <div style={{ width: '72px', height: '72px', border: '2px solid rgba(201,168,76,0.7)', transform: 'rotate(45deg)', animation: 'soeSpin 2.6s linear infinite', boxShadow: '0 0 26px rgba(201,168,76,0.15)' }} />
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(22px, 5vw, 32px)', color: COLORS.parchment }}>Analyzing scan quality...</div>
              <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: COLORS.muted, maxWidth: '620px' }}>{scoringMessage || uploadMessage || 'Scoring in progress — check back soon.'}</div>
              {uploadedScanId && <div style={{ fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.16em', color: 'rgba(201,168,76,0.72)', wordBreak: 'break-all' }}>Scan ID · {uploadedScanId}</div>}
            </div>
          )}

          {/* SUCCESS */}
          {uploadState === 'success' && scoredScan && (
            <div style={{ position: 'relative', display: 'grid', gap: '18px', textAlign: 'center', justifyItems: 'center', animation: 'soeScaleIn 420ms ease-out forwards' }}>
              <div style={labelStyle}>Reward Granted</div>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(46px, 12vw, 84px)', color: COLORS.gold, lineHeight: 1, textShadow: '0 0 18px rgba(201,168,76,0.18)' }}>+{scoredScan.reward_exp} $EXP</div>
              <div style={{ padding: '9px 14px', borderRadius: '999px', border: '1px solid rgba(201,168,76,0.25)', background: 'rgba(201,168,76,0.06)', color: COLORS.gold, fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.22em', textTransform: 'uppercase' }}>{successTierLabel}</div>
              <div style={{ width: '100%', maxWidth: '460px', display: 'grid', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                  <span style={labelStyle}>Quality Score</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '28px', color: COLORS.parchment }}>{scoredScan.quality_score ?? 0}</span>
                </div>
                <div style={{ width: '100%', height: '8px', borderRadius: '999px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(0, Math.min(100, scoredScan.quality_score ?? 0))}%`, height: '100%', background: COLORS.gold, borderRadius: '999px' }} />
                </div>
              </div>
              <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '18px', color: 'rgba(245,240,232,0.85)', fontStyle: 'italic' }}>Your scan is now part of the shared metaverse.</div>
              <div style={{ width: '100%', display: 'grid', gap: '12px', maxWidth: '480px' }}>
                <button type="button" onClick={resetUploadState} style={secondaryButtonStyle}>Scan Another</button>
                <a href="#my-scans" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', width: '100%', background: COLORS.gold, color: '#111', border: `1px solid ${COLORS.gold}`, borderRadius: '14px', height: '46px', fontFamily: 'Cinzel, serif', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase' }}>View My Scans</a>
              </div>
            </div>
          )}

          {/* ERROR */}
          {uploadState === 'error' && (
            <div style={{ display: 'grid', gap: '16px' }}>
              <div style={{ borderRadius: '18px', border: '1px solid rgba(210,123,110,0.32)', background: 'rgba(210,123,110,0.07)', padding: '18px' }}>
                <div style={{ ...labelStyle, color: COLORS.danger, marginBottom: '8px' }}>Upload Error</div>
                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '18px', color: COLORS.parchment }}>{errorMessage || 'Something went wrong.'}</div>
              </div>
              <button type="button" onClick={resetUploadState} style={secondaryButtonStyle}>Try Again</button>
            </div>
          )}
        </section>

        {/* MY SCANS */}
        <section id="my-scans" style={{ marginTop: '30px' }}>
          <div style={{ ...labelStyle, marginBottom: '8px' }}>Archive</div>
          <h2 style={{ margin: '0 0 16px', fontFamily: 'Cinzel, serif', fontSize: 'clamp(24px, 5vw, 36px)', color: COLORS.parchment, fontWeight: 400 }}>My Scans</h2>

          {scansError ? (
            <div style={{ borderRadius: '18px', border: '1px solid rgba(210,123,110,0.28)', background: 'rgba(210,123,110,0.06)', padding: '16px', fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: COLORS.parchment }}>{scansError}</div>
          ) : scans.length === 0 && !isLoadingScans ? (
            <div style={{ borderRadius: '18px', border: `1px solid ${COLORS.borderSoft}`, background: COLORS.card, padding: '18px', fontFamily: 'Cormorant Garamond, serif', fontSize: '16px', color: COLORS.muted }}>No scans yet. Upload your first scan above.</div>
          ) : (
            <div style={{ display: 'grid', gap: '14px', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
              {scans.map((scan) => {
                const isScored = scan.status === 'scored';
                const score = scan.quality_score ?? 0;
                return (
                  <div key={scan.id} style={{ background: COLORS.card, border: `1px solid ${COLORS.borderSoft}`, borderRadius: '20px', padding: '16px', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', boxShadow: '0 12px 30px rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start', marginBottom: '10px' }}>
                      <div>
                        <div style={{ fontFamily: 'Cinzel, serif', fontSize: '16px', lineHeight: 1.2, color: COLORS.parchment }}>{scan.location_name?.trim() || 'Unnamed Scan'}</div>
                        <div style={{ marginTop: '4px', fontFamily: 'Cormorant Garamond, serif', fontSize: '13px', color: COLORS.muted }}>{formatRelativeTime(scan.created_at)}</div>
                      </div>
                      <div style={{ padding: '5px 8px', borderRadius: '999px', border: `1px solid ${isScored ? 'rgba(123,196,127,0.32)' : 'rgba(201,152,76,0.28)'}`, background: isScored ? 'rgba(123,196,127,0.08)' : 'rgba(201,152,76,0.08)', color: isScored ? COLORS.green : COLORS.amber, fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.16em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{scan.status}</div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                      <span style={{ padding: '4px 8px', borderRadius: '999px', border: `1px solid ${COLORS.border}`, background: 'rgba(255,255,255,0.025)', color: COLORS.gold, fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em', textTransform: 'uppercase' }}>{scan.scan_format}</span>
                      <span style={{ padding: '4px 8px', borderRadius: '999px', border: `1px solid ${COLORS.border}`, background: 'rgba(255,255,255,0.025)', color: COLORS.muted, fontFamily: 'Cinzel, serif', fontSize: '8px', letterSpacing: '0.15em' }}>{formatFileSize(scan.file_size_bytes)}</span>
                    </div>
                    {isScored ? (
                      <div style={{ display: 'grid', gap: '8px', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={labelStyle}>Quality</span>
                          <span style={{ fontFamily: 'Cinzel, serif', fontSize: '18px', color: COLORS.parchment }}>{score}</span>
                        </div>
                        <div style={{ width: '100%', height: '5px', borderRadius: '999px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.max(0, Math.min(100, score))}%`, height: '100%', borderRadius: '999px', background: COLORS.gold }} />
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginBottom: '12px', fontFamily: 'Cormorant Garamond, serif', fontSize: '14px', color: COLORS.muted }}>Scoring in progress...</div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={labelStyle}>EXP Earned</span>
                      <span style={{ fontFamily: 'Cinzel, serif', fontSize: '22px', color: isScored ? COLORS.gold : 'rgba(201,168,76,0.46)' }}>+{scan.reward_exp}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {hasMoreScans && (
            <div style={{ marginTop: '18px' }}>
              <button type="button" onClick={() => void loadScans(scansOffset, true)} disabled={isLoadingScans} style={{ ...secondaryButtonStyle, width: '100%', opacity: isLoadingScans ? 0.6 : 1, cursor: isLoadingScans ? 'default' : 'pointer' }}>
                {isLoadingScans ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
