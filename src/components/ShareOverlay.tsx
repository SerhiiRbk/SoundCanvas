/**
 * Share Overlay — post-recording preview + download + share.
 *
 * Shows a fullscreen overlay with:
 *  - Looping video preview
 *  - Download button
 *  - Share button (Web Share API, mobile)
 *  - New Recording / Back buttons
 */

import React, { useRef, useEffect, useState } from 'react';
import { downloadBlob, shareBlob, canShareFiles } from '../audio/recordingEngine';

interface ShareOverlayProps {
  blob: Blob;
  onNewRecording: () => void;
  onClose: () => void;
}

export const ShareOverlay: React.FC<ShareOverlayProps> = ({
  blob,
  onNewRecording,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [canShare, setCanShare] = useState(false);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(blob);
    setVideoUrl(url);
    setCanShare(canShareFiles());
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  const handleDownload = () => {
    downloadBlob(blob);
  };

  const handleShare = async () => {
    const ok = await shareBlob(blob);
    if (ok) setShared(true);
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <h3 style={styles.title}>Your Creation</h3>

        {/* Video preview */}
        <div style={styles.videoContainer}>
          {videoUrl && (
            <video
              ref={videoRef}
              src={videoUrl}
              autoPlay
              loop
              muted
              playsInline
              style={styles.video}
            />
          )}
        </div>

        {/* Action buttons */}
        <div style={styles.actions}>
          <button style={styles.primaryBtn} onClick={handleDownload}>
            Download
          </button>
          {canShare && (
            <button
              style={styles.shareBtn}
              onClick={handleShare}
            >
              {shared ? 'Shared!' : 'Share'}
            </button>
          )}
        </div>

        <div style={styles.secondaryActions}>
          <button style={styles.secondaryBtn} onClick={onNewRecording}>
            New Recording
          </button>
          <button style={styles.secondaryBtn} onClick={onClose}>
            Back to Edit
          </button>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(5, 5, 16, 0.92)',
    backdropFilter: 'blur(20px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1500,
  },
  card: {
    maxWidth: 440,
    width: '90%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 300,
    color: '#fff',
    letterSpacing: '-0.02em',
  },
  videoContainer: {
    width: '100%',
    aspectRatio: '16 / 9',
    borderRadius: 12,
    overflow: 'hidden',
    background: '#000',
    border: '1px solid rgba(255, 255, 255, 0.08)',
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  actions: {
    display: 'flex',
    gap: 12,
    width: '100%',
  },
  primaryBtn: {
    flex: 1,
    padding: '14px 0',
    background: 'rgba(99, 102, 241, 0.8)',
    border: 'none',
    borderRadius: 10,
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    fontFamily: "'Inter', -apple-system, sans-serif",
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  shareBtn: {
    flex: 1,
    padding: '14px 0',
    background: 'rgba(16, 185, 129, 0.7)',
    border: 'none',
    borderRadius: 10,
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    fontFamily: "'Inter', -apple-system, sans-serif",
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  secondaryActions: {
    display: 'flex',
    gap: 12,
    width: '100%',
  },
  secondaryBtn: {
    flex: 1,
    padding: '10px 0',
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
    fontFamily: "'Inter', -apple-system, sans-serif",
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
};
