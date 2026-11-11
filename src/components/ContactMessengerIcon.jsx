import {ExternalLink} from 'lucide-react';
import {contactDestination} from '../utils/contactDestination.js';

export default function ContactMessengerIcon({url, size = 16}) {
  const destination = contactDestination(url);
  if (!destination) return <ExternalLink size={size} aria-hidden="true" />;
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="contact-messenger-icon" data-messenger={destination.id}>
    {destination.id === 'telegram' ? <>
      <circle cx="12" cy="12" r="12" fill="#229ED9" />
      <path d="m5.1 11.6 13.2-5.1c.6-.2 1.1.1.9.9l-2.3 10.8c-.2.8-.6 1-1.3.6l-3.5-2.6-1.7 1.7c-.2.2-.3.3-.7.3l.3-3.6 6.5-5.9c.3-.3-.1-.5-.5-.2l-8.1 5.1-3.5-1.1c-.8-.3-.8-.7.7-.9Z" fill="#fff" />
    </> : <>
      <path d="M12 1.3a10.5 10.5 0 0 0-9 16L1.5 22.5l5.4-1.4A10.5 10.5 0 1 0 12 1.3Z" fill="#25D366" />
      <path d="M12 3.6a8.2 8.2 0 1 1-4.3 15.2l-.5-.3-2.9.8.8-2.8-.3-.5A8.2 8.2 0 0 1 12 3.6Z" fill="none" stroke="#fff" strokeWidth="1.3" />
      <path d="M9 7.6c-.2-.5-.4-.5-.7-.5h-.5c-.3 0-.5.1-.7.4-.3.3-.9.9-.9 2.2s.9 2.6 1 2.8c.2.2 1.9 3 4.6 4 .6.2 1.1.4 1.5.4.6.1 1.1.1 1.5 0 .5-.1 1.6-.7 1.8-1.3.2-.6.2-1.1.1-1.2-.1-.2-.3-.2-.6-.4l-1.8-.8c-.3-.1-.5-.2-.7.2l-.9 1c-.1.2-.3.2-.6.1a7.3 7.3 0 0 1-2.1-1.3 7.8 7.8 0 0 1-1.4-1.8c-.2-.3 0-.5.1-.6l.5-.6c.2-.2.2-.3.3-.5.1-.1 0-.3 0-.5L9 7.6Z" fill="#fff" />
    </>}
  </svg>;
}
