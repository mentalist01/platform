import {interactiveTheoryDefinition} from './interactiveTheoryCatalog.js';

// The board's existing Y.Doc carries a replaceable state snapshot, separate
// from its geometry/items and from the library's saved initial parameters.
export const INTERACTIVE_THEORY_MAP = 'preparedInteractiveTheory';
export function interactiveTheoryState(doc,card) {
  const definition=interactiveTheoryDefinition(card.interactive?.typeId);
  if(!definition)return null;
  const map=doc?.getMap(INTERACTIVE_THEORY_MAP),values={};
  for(const field of Object.keys(definition.reset(card.interactive.params)))values[field]=map?.get(`${card.id}:${field}`);
  return definition.normalizeState(values,card.interactive.params);
}
export function updateInteractiveTheory(doc,card,patch,{reset=false,readOnly=false}={}) {
  const definition=interactiveTheoryDefinition(card.interactive?.typeId);
  if(!doc||!definition||readOnly)return false;
  const map=doc.getMap(INTERACTIVE_THEORY_MAP),current=interactiveTheoryState(doc,card),defaults=definition.reset(card.interactive.params);
  const requested=reset?defaults:patch,normalized=definition.normalizeState({...current,...requested},card.interactive.params);
  doc.transact(()=>{
    for(const key of Object.keys(defaults))if(reset||Object.hasOwn(requested,key))map.set(`${card.id}:${key}`,normalized[key]);
  },'prepared-interactive:state');
  return true;
}
