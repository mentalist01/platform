import {Check,Sparkles} from 'lucide-react';

export default function PreparedSolveCelebration({group}){
  return <div className="prepared-solve-celebration" role="status" aria-live="polite">
    <span className="prepared-success-check"><Check size={25} strokeWidth={3}/></span>
    <span><strong>Верно! <Sparkles size={17}/></strong><small>{group?'Отличная командная работа':'Отличная работа'}</small></span>
    <div className="prepared-success-confetti" aria-hidden="true">{Array.from({length:8},(_,i)=><i key={i} style={{'--piece':i,'--burst-x':`${[-115,-85,-48,45,82,115,-105,102][i]}px`,'--burst-y':`${[-38,-68,-84,-82,-60,-36,35,36][i]}px`}}/>)}</div>
  </div>;
}
