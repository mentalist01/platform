import {lazy,Suspense,useState} from 'react';
import {BookOpen} from 'lucide-react';
const Library=lazy(()=>import('./PreparedTaskLibrary.jsx'));

export default function PreparedTaskLibraryLauncher(props) {
  const [requested,setRequested]=useState(false);
  const trigger=<button type="button" className="prepared-library-trigger" disabled={requested} onClick={()=>setRequested(true)}><BookOpen size={16}/>{requested?'Открываем наборы…':props.label||'Задания к уроку'}</button>;
  return requested?<Suspense fallback={trigger}><Library {...props} initiallyOpen/></Suspense>:trigger;
}
