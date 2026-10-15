import React, { useRef, useState } from 'react';
import { authenticatedUploadsFetch } from '../services/api';
import { downloadAuthenticatedFile } from '../utils/fileDownload';
import { startChatAttachmentDownload } from '../utils/chatAttachmentDownload';

// Download from a Blob instead of navigating the lesson tab to /uploads.
// Even an expired session or an inline PDF response must keep the call mounted.
const ChatAttachmentDownload = ({ href, download, children, ...props }) => {
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const handleClick = async (event) => {
    try {
      await startChatAttachmentDownload(event, {
        busyRef,
        setBusy,
        setError,
        download: () => downloadAuthenticatedFile({
          url: href,
          name: download,
          fetchFile: /^(data:|blob:)/i.test(String(href || ''))
            ? (url) => fetch(url)
            : authenticatedUploadsFetch,
        }),
      });
    } catch (failure) {
      setError(failure?.message || 'Не удалось скачать файл. Попробуйте снова.');
    }
  };
  return (
    <>
      <a {...props} href={href} download={download} target="_blank" rel="noopener noreferrer"
        onClick={handleClick} aria-busy={busy || undefined} aria-disabled={busy || undefined}>
        {children}
      </a>
      {error && <span role="alert" className="block px-2 py-1 text-xs font-semibold text-red-600">{error}</span>}
    </>
  );
};

export default ChatAttachmentDownload;
