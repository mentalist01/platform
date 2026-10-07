// H.264 can use the Windows hardware encoder. Keep all other codecs offered
// so receivers without H.264 still negotiate their supported video format.
export function preferH264ForVideoSender(pc, sender, capabilities = globalThis.RTCRtpSender) {
  try {
    const transceiver = pc?.getTransceivers?.().find(item => item.sender === sender && !item.stopped);
    if (typeof transceiver?.setCodecPreferences !== 'function') return false;
    const codecs = capabilities?.getCapabilities?.('video')?.codecs;
    if (!Array.isArray(codecs)) return false;
    const h264 = codecs.filter(codec => codec.mimeType?.toLowerCase() === 'video/h264');
    if (!h264.length) return false;
    const others = codecs.filter(codec => codec.mimeType?.toLowerCase() !== 'video/h264');
    transceiver.setCodecPreferences([...h264, ...others]);
    return true;
  } catch {
    // Older browsers may reject preferences. Their normal negotiation remains.
    return false;
  }
}
