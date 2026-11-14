import type { QuestionnaireDef } from './questionnaire/types';
import type { StudyResponse, StudyScale } from '../src/app/studyRoute';
export function studyScales(def:QuestionnaireDef):StudyScale[] {
  return def.scaleOrder.map(id => {
    const numbers = [...new Set([...def.key[id].yes,...def.key[id].no])].sort((a,b) => a-b);
    return {id,code:def.scaleInfo[id].code,title:def.scaleInfo[id].title,count:numbers.length,first:numbers[0] ?? 1};
  }).filter(s => s.count > 0);
}
export function studyQuestions(def:QuestionnaireDef, scale:string):StudyResponse | null {
  const scales = studyScales(def);
  const info = scales.find(s => s.id === scale);
  if (!info) return null;
  const key = def.key[scale];
  const questions = [...new Set([...key.yes,...key.no])].sort((a,b) => a-b).map(number => ({
    number,text:def.questions[number-1],answers:[...(key.yes.includes(number) ? ['Y' as const] : []),...(key.no.includes(number) ? ['N' as const] : [])]
  }));
  return {test:def.id,title:def.title,scale:info,scales,questions};
}
