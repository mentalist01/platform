import React, { useId } from 'react';
import { Award, Code2, Flame, Sparkles, Target, Trophy } from 'lucide-react';
import './AchievementMedal.css';

const ICONS = { ege: Target, python: Code2, mocks: Trophy, practice: Flame, growth: Sparkles };
export default function AchievementMedal({ item, decorative = true }) {
  const uid = useId().replace(/:/g, ''), metal = `${uid}-metal`, core = `${uid}-core`;
  const rarity = item.rarity || 'bronze', Icon = ICONS[item.category] || Award;
  return <span className={`achievement-medal achievement-medal--${rarity}`} aria-hidden={decorative || undefined}>
    <svg className="achievement-medal-frame" viewBox="0 0 100 104" aria-hidden="true">
      <defs>
        <linearGradient id={metal} x1="0" y1="0" x2="1" y2="1"><stop stopColor="var(--metal-light)" /><stop offset=".42" stopColor="var(--metal-mid)" /><stop offset=".62" stopColor="var(--metal-light)" /><stop offset="1" stopColor="var(--metal-edge)" /></linearGradient>
        <linearGradient id={core} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="var(--core-light)" /><stop offset="1" stopColor="var(--core-deep)" /></linearGradient>
      </defs>
      {rarity === 'bronze' && <>
        <circle cx="50" cy="50" r="36" fill={`url(#${metal})`} stroke="var(--metal-edge)" />
        <circle cx="50" cy="50" r="30" fill={`url(#${core})`} stroke="var(--metal-light)" />
        <circle cx="50" cy="50" r="26" fill="none" stroke="var(--metal-edge)" strokeOpacity=".45" />
      </>}
      {rarity === 'silver' && <>
        <path d="M34 10H66L88 32V64L66 86H34L12 64V32Z" fill={`url(#${metal})`} stroke="var(--metal-edge)" />
        <path d="M36 18H64L80 34V62L64 78H36L20 62V34Z" fill={`url(#${core})`} stroke="var(--metal-light)" />
        <path d="M38 23H62L75 36V60L62 73H38L25 60V36Z" fill="none" stroke="var(--metal-edge)" strokeOpacity=".55" />
        <path d="M24 25L34 15M68 81L78 71" stroke="var(--metal-light)" strokeWidth="2" />
      </>}
      {rarity === 'gold' && <>
        <path d="M50 5L84 19L80 58Q74 81 50 97Q26 81 20 58L16 19Z" fill={`url(#${metal})`} stroke="var(--metal-edge)" />
        <path d="M50 14L76 25L72 57Q67 75 50 87Q33 75 28 57L24 25Z" fill={`url(#${core})`} stroke="var(--metal-light)" strokeWidth="1.5" />
        <path d="M32 66Q35 76 44 81M68 66Q65 76 56 81" fill="none" stroke="var(--metal-light)" strokeWidth="2" />
        <path d="M50 72L53 77L50 82L47 77Z" fill="var(--metal-light)" />
      </>}
      {rarity === 'diamond' && <>
        <path d="M50 2L80 16L94 43L81 74L50 100L19 74L6 43L20 16Z" fill={`url(#${metal})`} stroke="var(--metal-edge)" />
        <path d="M50 2L50 17L27 29L20 16ZM94 43L79 47L68 73L81 74ZM50 100L50 86L32 73L19 74Z" fill="var(--metal-light)" />
        <path d="M20 16L27 29L21 48L6 43ZM50 2L50 17L73 29L80 16ZM50 100L50 86L68 73L81 74Z" fill="var(--metal-edge)" opacity=".65" />
        <path d="M50 17L73 29L79 47L68 73L50 86L32 73L21 47L27 29Z" fill={`url(#${core})`} stroke="var(--metal-light)" strokeWidth="1.5" />
        <path d="M50 22L69 32L74 47M26 48L36 69L50 80" fill="none" stroke="#fff" strokeOpacity=".4" />
        <path d="M50 7L52 11L50 15L48 11ZM50 88L52 92L50 96L48 92Z" fill="#fff" />
      </>}
    </svg>
    <Icon className="achievement-medal-symbol" size={25} strokeWidth={rarity === 'diamond' ? 1.6 : 1.7} />
  </span>;
}
