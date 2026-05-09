'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import styles from './CallModal.module.css';

interface Participant {
  id: number;
  username: string;
}

type CallState = 'idle' | 'calling' | 'incoming' | 'connected';

interface CallModalProps {
  conversationId: number;
  currentUser: { id: number; username: string };
  otherUser: Participant;
  token: string;
}

const STUN_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

function getInitials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function useTimer(active: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) { setSeconds(0); return; }
    const id = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export default function CallModal({ conversationId, currentUser, otherUser, token }: CallModalProps) {
  const [callState, setCallState] = useState<CallState>('idle');
  const [callType, setCallType] = useState<'audio' | 'video'>('video');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [incomingCallType, setIncomingCallType] = useState<'audio' | 'video'>('video');

  const signalingRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const timer = useTimer(callState === 'connected');

  // ── Signaling WebSocket ──
  const connectSignaling = useCallback(() => {
    if (signalingRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(`ws://${process.env.NEXT_PUBLIC_API_URL}/ws/call/${conversationId}/`);

    ws.onmessage = async (e) => {
      const data = JSON.parse(e.data);
      if (data.sender_id === currentUser.id) return; // Ignore own signals

      switch (data.type) {
        case 'call-offer':
          setIncomingCallType(data.call_type || 'video');
          pendingOfferRef.current = data.payload;
          setCallState('incoming');
          break;
        case 'call-answer':
          if (pcRef.current) {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.payload));
            setCallState('connected');
          }
          break;
        case 'ice-candidate':
          if (pcRef.current && data.payload) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(data.payload));
          }
          break;
        case 'call-reject':
        case 'call-end':
          hangUp(false);
          break;
      }
    };

    signalingRef.current = ws;
  }, [conversationId, currentUser.id]);

  useEffect(() => {
    connectSignaling();
    return () => {
      signalingRef.current?.close();
    };
  }, [connectSignaling]);

  // ── Send signal helper ──
  const sendSignal = (type: string, payload: any = null, ct?: string) => {
    signalingRef.current?.send(JSON.stringify({
      type,
      payload,
      sender_id: currentUser.id,
      sender_username: currentUser.username,
      call_type: ct ?? callType,
    }));
  };

  // ── Create RTCPeerConnection ──
  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(STUN_SERVERS);

    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal('ice-candidate', e.candidate.toJSON());
    };

    pc.ontrack = (e) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = e.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setCallState('connected');
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) hangUp(false);
    };

    pcRef.current = pc;
    return pc;
  }, [callType]);

  // ── Get local media ──
  const getMedia = async (type: 'audio' | 'video') => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video',
    });
    localStreamRef.current = stream;
    if (localVideoRef.current && type === 'video') {
      localVideoRef.current.srcObject = stream;
    }
    return stream;
  };

  // ── Start call (caller side) ──
  const startCall = async (type: 'audio' | 'video') => {
    setCallType(type);
    setCallState('calling');
    try {
      const stream = await getMedia(type);
      const pc = createPeerConnection();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal('call-offer', offer, type);
    } catch (err) {
      console.error('Failed to start call:', err);
      hangUp(false);
    }
  };

  // ── Accept incoming call ──
  const acceptCall = async () => {
    const type = incomingCallType;
    setCallType(type);
    try {
      const stream = await getMedia(type);
      const pc = createPeerConnection();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      if (pendingOfferRef.current) {
        await pc.setRemoteDescription(new RTCSessionDescription(pendingOfferRef.current));
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal('call-answer', answer, type);
      setCallState('connected');
    } catch (err) {
      console.error('Failed to accept call:', err);
      hangUp(false);
    }
  };

  // ── Hang up ──
  const hangUp = useCallback((sendEnd = true) => {
    if (sendEnd) sendSignal('call-end');
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    pendingOfferRef.current = null;
    setCallState('idle');
    setIsMuted(false);
    setIsCameraOff(false);
  }, []);

  // ── Toggle mute ──
  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = isMuted; });
    setIsMuted(m => !m);
  };

  // ── Toggle camera ──
  const toggleCamera = () => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = isCameraOff; });
    setIsCameraOff(c => !c);
  };

  // ── Idle: just show call buttons (embedded in parent via exported trigger) ──
  if (callState === 'idle') {
    return (
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          id="audio-call-btn"
          onClick={() => startCall('audio')}
          style={{
            background: 'transparent', border: 'none', color: '#6366f1',
            width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s, color 0.15s',
          }}
          title="Voice call"
          onMouseEnter={(e) => { e.currentTarget.style.background = '#21262d'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M19.167 15.65c-.867-.32-1.785-.48-2.733-.48-.523 0-1.042.062-1.549.186-.411.1-.734.39-.861.792l-1.006 3.167a14.542 14.542 0 0 1-7.228-7.228l3.167-1.006c.4-.127.691-.45.792-.861.124-.507.186-1.026.186-1.55 0-.947-.16-1.865-.48-2.732a1.056 1.056 0 0 0-1.037-.69H5.06A2.395 2.395 0 0 0 2.667 7.64 16.333 16.333 0 0 0 19 24a2.396 2.396 0 0 0 2.393-2.393v-4.92a1.056 1.056 0 0 0-.69-1.037z" />
          </svg>
        </button>
        <button
          id="video-call-btn"
          onClick={() => startCall('video')}
          style={{
            background: 'transparent', border: 'none', color: '#6366f1',
            width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s, color 0.15s',
          }}
          title="Video call"
          onMouseEnter={(e) => { e.currentTarget.style.background = '#21262d'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className={styles.overlay}>
      {/* ── INCOMING CALL ── */}
      {callState === 'incoming' && (
        <div className={styles.incomingCard}>
          <div className={styles.incomingAvatar}>{getInitials(otherUser.username)}</div>
          <div className={styles.incomingName}>{otherUser.username}</div>
          <div className={styles.incomingSubtitle}>
            Incoming {incomingCallType === 'video' ? '🎥 Video' : '📞 Voice'} Call...
          </div>
          <div className={styles.incomingBtns}>
            <button className={styles.btnAccept} onClick={acceptCall} title="Accept" id="accept-call-btn">✓</button>
            <button className={styles.btnReject} onClick={() => { sendSignal('call-reject'); hangUp(false); }} title="Reject" id="reject-call-btn">✕</button>
          </div>
        </div>
      )}

      {/* ── CALLING (waiting for answer) ── */}
      {callState === 'calling' && (
        <div className={styles.incomingCard}>
          <div className={styles.incomingAvatar}>{getInitials(otherUser.username)}</div>
          <div className={styles.incomingName}>{otherUser.username}</div>
          <div className={styles.incomingSubtitle}>
            {callType === 'video' ? '🎥 Video' : '📞 Voice'} calling...
          </div>
          <div className={styles.connectingState}>
            <div className={styles.spinner} />
          </div>
          <div className={styles.incomingBtns}>
            <button className={styles.btnReject} onClick={() => hangUp(true)} title="Cancel" id="cancel-call-btn">✕</button>
          </div>
        </div>
      )}

      {/* ── ACTIVE CALL ── */}
      {callState === 'connected' && (
        <div className={styles.callContainer}>
          {/* Header */}
          <div className={styles.callHeader}>
            <div className={styles.callPartnerInfo}>
              <div className={styles.avatarMd}>{getInitials(otherUser.username)}</div>
              <span className={styles.callPartnerName}>{otherUser.username}</span>
            </div>
            <span className={styles.callTimer}>{timer}</span>
          </div>

          {/* Video / Audio area */}
          <div className={styles.videoArea}>
            {callType === 'video' ? (
              <>
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className={styles.remoteVideo}
                />
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={styles.localVideo}
                />
              </>
            ) : (
              <div className={styles.audioPlaceholder}>
                <div className={styles.audioAvatarLg}>{getInitials(otherUser.username)}</div>
                <div className={styles.audioName}>{otherUser.username}</div>
                <div className={styles.audioStatus}>🟢 Connected</div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className={styles.callControls}>
            {/* Mute */}
            <button
              id="mute-btn"
              className={`${styles.ctrlBtn} ${isMuted ? styles.ctrlBtnActive : ''}`}
              onClick={toggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? '🔇' : '🎙️'}
            </button>

            {/* Camera (video only) */}
            {callType === 'video' && (
              <button
                id="camera-btn"
                className={`${styles.ctrlBtn} ${isCameraOff ? styles.ctrlBtnActive : ''}`}
                onClick={toggleCamera}
                title={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
              >
                {isCameraOff ? '📷' : '🎥'}
              </button>
            )}

            {/* End call */}
            <button
              id="end-call-btn"
              className={styles.ctrlBtnEnd}
              onClick={() => hangUp(true)}
              title="End call"
            >
              📵
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
