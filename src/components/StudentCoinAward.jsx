import {createPortal} from 'react-dom';
import {useFullscreenPortalTarget} from '../hooks/useFullscreenPortalTarget.js';
import ivanCoin from '../assets/ivan-coin-badge-128.webp';
import './StudentCoinAward.css';

const coinNames = {one: 'монета', few: 'монеты', many: 'монет', other: 'монеты'};
const pluralRules = new Intl.PluralRules('ru');

export default function StudentCoinAward({award}) {
  const target = useFullscreenPortalTarget();
  if (!target) return null;

  return createPortal(<div className="student-coin-award" role="status">
    {award && <div className="student-coin-award__card" key={award.sequence}>
      <div className="student-coin-award__emblem" aria-hidden="true">
        <span className="student-coin-award__spark student-coin-award__spark--first" />
        <span className="student-coin-award__spark student-coin-award__spark--second" />
        <span className="student-coin-award__spark student-coin-award__spark--third" />
        <img src={ivanCoin} alt="" draggable="false" />
      </div>
      <div>
        <strong>+{award.amount.toLocaleString('ru-RU')} {coinNames[pluralRules.select(award.amount)]}</strong>
        <span>Награда за задачу</span>
      </div>
    </div>}
  </div>, target);
}
