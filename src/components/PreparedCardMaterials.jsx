import {Check,Download,Ellipsis,FileSpreadsheet,FileCheck} from 'lucide-react';
import FileDownloadLink from './FileDownloadLink.jsx';
import PreparedLiveWorkbook from './PreparedLiveWorkbook.jsx';
import PreparedWorkbookHistory from './PreparedWorkbookHistory.jsx';
import PreparedReferenceSolutions from './PreparedReferenceSolutions.jsx';
import PreparedCardPopover from './PreparedCardPopover.jsx';
import './PreparedCardCompact.css';
import {PREPARED_REFERENCE_PROMOTION} from './PreparedReferencePromotion.jsx';
import {PREPARED_REFERENCE_REPLACEMENT} from './PreparedReferenceReplacement.jsx';

export default function PreparedCardMaterials({card,run,readOnly,busy,canEditFiles,refresh,onOpen,onExtra}){
  const replaceReference=card.referenceReplacementAvailable&&run.canManage&&!readOnly
    ?()=>window.dispatchEvent(new CustomEvent(PREPARED_REFERENCE_REPLACEMENT,{detail:{runId:run.id,cardId:card.id}})):undefined;
  const reference=<PreparedReferenceSolutions compact reference={card.referenceSolution} canManage={run.canManage} solved={card.status==='solved'} onReplace={replaceReference} disabled={busy||readOnly}/>;
  return <div className="prepared-card-materials">
    {card.attachments.map((asset,index)=>{
      const download=<FileDownloadLink href={asset.url} download={asset.name}><Download size={14}/>Скачать исходный файл</FileDownloadLink>;
      const history=(asset.helper||asset.solution)&&<PreparedWorkbookHistory asset={asset} run={run} cardId={card.id} disabled={readOnly||busy} canRestart={asset.helper&&canEditFiles&&!run.homework} refresh={refresh}/>;
      const menu=<>{download}{history}{index===0&&(card.referencePromotion||card.referencePromotionAvailable)&&run.canManage&&<button type="button" disabled={busy||readOnly} onClick={()=>window.dispatchEvent(new CustomEvent(PREPARED_REFERENCE_PROMOTION,{detail:{runId:run.id,cardId:card.id}}))}><FileCheck size={14}/>Сделать готовым разбором</button>}{index===0&&replaceReference&&<button type="button" disabled={busy||readOnly} onClick={replaceReference}><FileCheck size={14}/>Заменить разбор</button>}{!canEditFiles&&run.groupId&&<small className="prepared-materials-hint">{asset.solution?'Сохранённая версия преподавателя · только просмотр':'Файл преподавателя · только просмотр'}</small>}</>;
      return <section className="prepared-material-row" key={asset.assetId} aria-label={`Материалы задачи: ${asset.name}`}>
        <div className="prepared-material-name"><span className="prepared-material-icon"><FileSpreadsheet size={17}/></span><div><strong title={asset.name}>{asset.name}</strong>{asset.solution&&<FileDownloadLink className="prepared-material-saved" href={asset.solution.url} download={asset.solution.name} title={`${asset.solution.name} · ${asset.solution.savedBy?.name||'Участник'}`}><Check size={11}/>{asset.attempt?.number>1&&!asset.attempt.hasSaved?'Предыдущая попытка':'Сохранено'} · {new Date(asset.solution.updatedAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</FileDownloadLink>}</div></div>
        {asset.helper&&canEditFiles?<PreparedLiveWorkbook compact asset={asset} run={run} cardId={card.id} disabled={readOnly||busy} refresh={refresh} onOpenSeparate={()=>onOpen(asset)} menuContent={menu} trailingAction={index===0?reference:null} extraActions={onExtra(asset)}/>:<div className="prepared-material-actions">{index===0&&reference}<PreparedCardPopover label={`Действия с файлом ${asset.name}`} icon={<Ellipsis size={18}/>} className="prepared-material-more">{menu}</PreparedCardPopover></div>}
      </section>;
    })}
    {!card.attachments.length&&card.referenceSolution&&<div className="prepared-material-reference-only">{reference}</div>}
  </div>;
}
