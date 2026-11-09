import './AvailabilityMinimumControl.css';
export default function AvailabilityMinimumControl({value,onChange}){
  return <div className="availability-minimum-control" role="group" aria-label="Минимальный свободный промежуток"><span>Свободное время</span>{[30,60].map(minutes=><button type="button" key={minutes} aria-pressed={value===minutes} onClick={()=>onChange(minutes)}>{minutes===60?'От 1 часа':'От 30 минут'}</button>)}</div>;
}
