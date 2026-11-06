import {Check} from 'lucide-react';

const colors=['#9e60e9','#6fd9b2','#f3bd63','#c39aff'];
const particles=Array.from({length:20},(_,i)=>{
  const angle=i*Math.PI/10,distance=93+(i*19)%60;
  return {
    '--spark-x':Math.round(Math.cos(angle)*distance*1.36)+'px',
    '--spark-y':Math.round(Math.sin(angle)*distance*.69)+'px',
    '--spark-size':(6+(i*7)%10)+'px',
    '--spark-spin':(i%2?1:-1)*(70+i*9)+'deg',
    '--spark-delay':(190+(i%5)*23)+'ms',
    '--spark-color':colors[i%colors.length],
  };
});

export default function PreparedSolveCelebration({group}){
  return <div className="prepared-solve-celebration" role="status">
    <div className="prepared-success-flash" aria-hidden="true"/>
    <div className="prepared-success-orbit" aria-hidden="true"/>
    <div className="prepared-success-orbit prepared-success-orbit--mint" aria-hidden="true"/>
    <div className="prepared-success-particles" aria-hidden="true">{particles.map((style,i)=><i key={i} style={style}/>)}</div>
    <div className="prepared-success-award">
      <span className="prepared-success-seal" aria-hidden="true"><Check size={29} strokeWidth={3}/></span>
      <span className="prepared-success-copy"><strong>Верно!</strong><small>{group?'Задача решена командой':'Задача решена'}</small></span>
      <span className="prepared-success-twinkle" aria-hidden="true"/>
    </div>
  </div>;
}
