import fs from 'node:fs';
import path from 'node:path';

const limits = { fps: 120, width: 16384, height: 16384, bitrate: 1000000000, lossPercent: 100,
  processingMs: 60000, processingLoad: 100, framesDropped: 1000000, freezes: 100000,
  availableBitrate: 1000000000, cpu: 2, network: 2 };
export function normalizeRtcVideoDiagnostic(value) {
  if (!value || !['outbound', 'inbound'].includes(value.direction)) return null;
  const row = { direction: value.direction };
  for (const [key, max] of Object.entries(limits)) {
    if (typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0) {
      row[key] = Math.round(Math.min(max, value[key]) * 100) / 100;
    }
  }
  if (['cpu', 'bandwidth', 'none', 'other', 'unknown'].includes(value.limitation)) row.limitation = value.limitation;
  const codec = String(value.codec || '').toLowerCase();
  if (['video/h264', 'video/vp8', 'video/vp9', 'video/av1', 'video/h265'].includes(codec)) row.codec = codec;
  if (typeof value.powerEfficient === 'boolean') row.powerEfficient = value.powerEfficient;
  if (['P2P/UDP', 'P2P/TCP', 'TURN/UDP', 'TURN/TCP', 'TURN/TLS', 'TURN', 'P2P'].includes(value.route)) row.route = value.route;
  if (['InvalidModificationError', 'InvalidStateError', 'OperationError', 'RangeError', 'NotSupportedError'].includes(value.parameterError)) row.parameterError = value.parameterError;
  return row;
}

// No screen contents, titles, addresses, SDP, tokens or arbitrary client text.
// Sampling is bounded independently of whether the room stays open for days.
export class RtcVideoDiagnostics {
  constructor({ file, now = Date.now, maxRecords = 5000, retentionMs = 3 * 86400000, onError = () => {} }) {
    Object.assign(this, { file, now, maxRecords, retentionMs, onError });
    this.rates = new Map(); this.timer = null; this.dirty = false;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      this.rows = Array.isArray(data) ? data.filter(row => now() - Date.parse(row.at) < retentionMs).slice(-maxRecords) : [];
    } catch { this.rows = []; }
  }
  record({ client, peer, event }) {
    const value = normalizeRtcVideoDiagnostic(event);
    if (!value || !client?.roomId || !client.auth?.id || !peer?.auth?.id) return false;
    const now = this.now(), key = client.clientId, rate = this.rates.get(key);
    if (rate && now - rate.start < 60000 && rate.count >= 60) return false;
    this.rates.set(key, rate && now - rate.start < 60000 ? { ...rate, count: rate.count + 1 } : { start: now, count: 1 });
    for (const [id, entry] of this.rates) if (now - entry.start > 60000) this.rates.delete(id);
    this.rows = this.rows.filter(row => now - Date.parse(row.at) < this.retentionMs).slice(-(this.maxRecords - 1));
    this.rows.push({ at: new Date(now).toISOString(), roomId: client.roomId,
      observerId: client.auth.id, observerRole: client.auth.role, peerId: peer.auth.id, peerRole: peer.auth.role, ...value });
    this.dirty = true;
    if (!this.timer) { this.timer = setTimeout(() => this.flush(), 5000); this.timer.unref?.(); }
    return true;
  }
  flush() {
    clearTimeout(this.timer); this.timer = null;
    if (!this.dirty) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const temp = this.file + '.tmp';
      fs.writeFileSync(temp, JSON.stringify(this.rows), { mode: 0o600 });
      fs.renameSync(temp, this.file); this.dirty = false;
    } catch (error) { this.onError(error); }
  }
}
