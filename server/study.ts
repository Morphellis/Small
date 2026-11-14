import type { QuestionnaireDef } from './questionnaire/types';
import type { StudyResponse, StudyScale } from '../src/app/studyRoute';
export function studyNumbers(def:QuestionnaireDef, scale:string):number[] {
  const control = new Set(def.controlItems ?? []);
  return [...new Set([...def.key[scale].yes,...def.key[scale].no])]
    .filter(n => !control.has(n) && !/обвест[иь].*круж/iu.test(def.questions[n-1]))
    .sort((a,b) => a-b);
}
export function studyScales(def:QuestionnaireDef):StudyScale[] {
  return def.scaleOrder.map(id => {
    const numbers = studyNumbers(def,id);
    return {id,code:def.scaleInfo[id].code,title:def.scaleInfo[id].title,count:numbers.length,first:numbers[0] ?? 1};
  }).filter(s => s.count > 0);
}
export function studyQuestions(def:QuestionnaireDef, scale:string):StudyResponse | null {
  const scales = studyScales(def);
  const info = scales.find(s => s.id === scale);
  if (!info) return null;
  const key = def.key[scale];
  const questions = studyNumbers(def,scale).map(number => ({
    number,text:def.questions[number-1],answers:[...(key.yes.includes(number) ? ['Y' as const] : []),...(key.no.includes(number) ? ['N' as const] : [])]
  }));
  return {test:def.id,title:def.title,scale:info,scales,questions};
}
