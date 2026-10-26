import {api} from './api.js';
import {normalizeLearningGroupList} from '../utils/learningGroups.js';
import {activeStudyGroupMembers} from '../utils/studySubjects.js';

export async function createStudyMatchGroup(teacherId,name,studentIds) {
  try{return await api.createLearningGroup({name,studentIds});}
  catch(error){
    // A lost response must not encourage creating the same pair twice.
    try{
      const groups=normalizeLearningGroupList(await api.getLearningGroups({teacherId,includeCompleted:true}));
      const ids=[...studentIds].sort().join('|');
      const existing=groups.find(group=>['forming','ready'].includes(group.status)&&group.name.trim().toLocaleLowerCase('ru')===name.trim().toLocaleLowerCase('ru')&&activeStudyGroupMembers(group).sort().join('|')===ids);
      if(existing)return {group:existing,recovered:true};
    }catch{/* Keep the original, actionable failure. */}
    throw error;
  }
}
