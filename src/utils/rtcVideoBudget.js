// Each recipient in a mesh room requires a separate video sender.
export function rtcVideoBudget({ group = false, peers = 1, camera = false, bitrate, framerate, scale = 1, width = 1920, height = 1080 }) {
  if (!group) return { maxBitrate: bitrate, maxFramerate: framerate, scaleResolutionDownBy: scale };
  const count = Math.max(1, Math.trunc(Number(peers) || 1));
  const aggregate = camera ? 1800000 : 7000000;
  const maxWidth = camera ? 640 : count >= 8 ? 1280 : count >= 4 ? 1600 : 1920;
  const maxHeight = camera ? 360 : count >= 8 ? 720 : count >= 4 ? 900 : 1080;
  return {
    maxBitrate: Math.min(bitrate, Math.floor(aggregate / count)),
    maxFramerate: Math.min(framerate, camera ? 15 : count >= 8 ? 10 : count >= 4 ? 12 : 15),
    scaleResolutionDownBy: Math.max(1, scale, width / maxWidth, height / maxHeight),
  };
}
