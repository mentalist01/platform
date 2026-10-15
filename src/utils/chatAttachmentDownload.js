export const startChatAttachmentDownload = async (event, { busyRef, setBusy, setError, download }) => {
  // Cancel the link synchronously, before waiting for authentication or bytes.
  // A failed request must never fall back to replacing the current lesson page.
  event.preventDefault();
  event.stopPropagation();
  if (busyRef.current) return;
  busyRef.current = true;
  setBusy(true);
  setError('');
  try {
    await download();
  } finally {
    busyRef.current = false;
    setBusy(false);
  }
};
