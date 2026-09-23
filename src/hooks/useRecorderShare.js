import { useEffect } from 'react';
import { api } from '../services/api';

// This is a second, local peer. Never stop or replace the call's original track.
export default function useRecorderShare({ enabled, jobId, track }) {
  useEffect(() => {
    if (!enabled || !jobId || track?.readyState !== 'live') return undefined;
    let disposed = false; let busy = false; let pc; let id; let offered = false;
    let createdAt = 0;
    const close = () => { pc?.close(); pc = null; offered = false; };
    const tick = async () => {
      if (busy || disposed) return;
      busy = true;
      try {
        if (!pc || ['failed', 'closed'].includes(pc.connectionState) || (pc.connectionState !== 'connected' && Date.now() - createdAt > 20000)) {
          const oldId = id;
          close();
          if (oldId) await api.desktopRecording('share', { action: 'stop', id: oldId }).catch(() => {});
          id = crypto.randomUUID(); createdAt = Date.now();
          // No STUN/TURN: this feed is only intended for OBS on this computer.
          pc = new RTCPeerConnection({ iceServers: [] });
          pc.addTrack(track, new MediaStream([track]));
          await pc.setLocalDescription(await pc.createOffer());
          await new Promise((resolve) => {
            const timeout = setTimeout(done, 3000);
            function done() { clearTimeout(timeout); pc?.removeEventListener('icegatheringstatechange', changed); resolve(); }
            function changed() { if (!pc || pc.iceGatheringState === 'complete') done(); }
            pc.addEventListener('icegatheringstatechange', changed); changed();
          });
        }
        if (disposed || !pc) return;
        const result = await api.desktopRecording('share', offered
          ? { action: 'poll', id }
          : { action: 'offer', id, jobId, offer: pc.localDescription.toJSON() });
        if (disposed || !pc) return;
        if (result.expired) { close(); return; }
        offered = true;
        if (result.answer && !pc.remoteDescription) await pc.setRemoteDescription(result.answer);
      } catch { if (!disposed && pc?.connectionState !== 'connected') close(); }
      finally { busy = false; }
    };
    void tick(); const timer = setInterval(tick, 2000);
    return () => {
      disposed = true; clearInterval(timer); close();
      if (id) void api.desktopRecording('share', { action: 'stop', id }).catch(() => {});
    };
  }, [enabled, jobId, track]);
}
