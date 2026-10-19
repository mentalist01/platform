import { ArrowRight, BookOpen, ExternalLink, Play } from 'lucide-react';
import RutubeChapterPlayer from './RutubeChapterPlayer';
import { getRutubeEmbedUrl, getRutubeWatchUrl } from '../utils/learningGroups';

export default function PythonGiftTheoryCard({ theory, title, onOpen }) {
  const video = theory?.rutube;
  const videoUrl = getRutubeEmbedUrl(video?.content);
  const recording = Boolean(theory?.recording);
  const hasMaterials = Object.keys(theory || {}).some(type => type !== 'rutube');
  if (!videoUrl && !recording) {
    return <button className="gift-theory gift-topic-theory" onClick={onOpen}><span><BookOpen size={19} /><b>Материалы к теме</b></span><span>Открыть объяснение <ArrowRight size={16} /></span></button>;
  }
  return <section className="gift-topic-video" aria-label={`Видеообъяснение темы «${title}»`}>
    <header>
      <div className="gift-video-icon"><Play size={23} fill="currentColor" aria-hidden="true" /></div>
      <div><span className="gift-video-eyebrow">ВИДЕОУРОК · ПЕРЕД ПРАКТИКОЙ</span><h3>Видеообъяснение темы</h3><p>Посмотри объяснение, затем закрепи тему в задачах ниже.</p></div>
    </header>
    <div className="gift-topic-video-player">
      {videoUrl ? <RutubeChapterPlayer url={videoUrl} chapters={video.chapters} title={`Видеообъяснение: ${title}`} loading="lazy" />
        : <button className="gift-video-preview" onClick={onOpen} aria-label={`Смотреть видеообъяснение: ${title}`}>
          <span className="gift-video-preview-code" aria-hidden="true"><span>python</span><code><b>print</b>(<em>"У меня получится!"</em>)</code></span>
          <span className="gift-video-preview-play"><Play size={32} fill="currentColor" aria-hidden="true" /></span>
          <span className="gift-video-preview-title"><b>{title}</b><span>Смотреть объяснение <ArrowRight size={17} /></span></span>
        </button>}
    </div>
    <footer><span><Play size={14} aria-hidden="true" /> Сначала видео, потом практика</span><div>
      {hasMaterials && <button onClick={onOpen}><BookOpen size={15} />Материалы к теме</button>}
      {videoUrl && <a href={getRutubeWatchUrl(videoUrl)} target="_blank" rel="noreferrer"><ExternalLink size={14} />Открыть на Rutube</a>}
    </div></footer>
  </section>;
}
