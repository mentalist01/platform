// Reuse the call's classified video streams so a screen share never becomes a webcam preview.
export const withFloatingCameraStreams = (participants, videos) => participants.map((participant) => ({
  ...participant,
  cameraStream: participant.isCameraEnabled === false ? null : videos.find((video) => video.hasVideo && video.videoKind === 'camera'
    && (participant.isSelf ? video.isSelf : !video.isSelf && video.peerId === participant.id))?.stream || null,
}));

// Camera thumbnails remain visible even when a large group's voice list is collapsed.
export const visibleFloatingParticipants = (participants, expanded) => participants.length <= 3 || expanded
  ? participants
  : participants.filter((participant) => participant.isSelf || participant.cameraStream);
