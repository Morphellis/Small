import { QUESTIONNAIRES } from './registry';
import { studyScales } from './study';
import { escapeHtml } from '../src/app/html';

export const TRAINER_URL = 'https://small.morphellis.workers.dev/';
export const STUDY_URL = 'https://small-botsfeature9nov.morphellis.workers.dev/';
export const BOT_USERNAME = 'odinochnayaPalata_bot';
export interface TrainingButton { text:string; callback_data?:string; web_app?:{url:string} }
export interface TrainingView { text:string; reply_markup:{inline_keyboard:TrainingButton[][]} }
export const studyUrl = (test:string,scale:string,question:number) => `${STUDY_URL}?study=study_${test}_${scale}_${question}#study/${test}/${scale}/${question}`;
export function trainingHome():TrainingView {
  return {text:'Тренажёр психологических тестов.\n\nДоступны СМОЛ, СМИЛ, ММИЛ и тест Люшера.\n\nДля работы с тестами откройте приложение',reply_markup:{inline_keyboard:[
    [{text:'Открыть тренажёр',web_app:{url:TRAINER_URL}}],
    ...Object.values(QUESTIONNAIRES).map(def => [{text:`Шкалы ${def.title}`,callback_data:`t1:test:${def.id}`}])
  ]}};
}

/** Старые сообщения с callback-кнопками открывают новый экран приложения. */
export function trainingView(data:string):TrainingView | null {
  if (data === 't1:home') return trainingHome();
  const parts = data.split(':');
  const [,action,id,scale,position,mode,selected] = parts;
  if (parts[0] !== 't1' || !Object.hasOwn(QUESTIONNAIRES,id ?? '')) return null;
  const def = QUESTIONNAIRES[id];
  const scales = studyScales(def);
  if (action === 'test' && parts.length === 3) return {text:`${def.title}\n\nВыберите шкалу. Вопросы откроются в приложении.`,reply_markup:{inline_keyboard:scales.map(s => [{text:`${s.code}: ${s.title}`,web_app:{url:studyUrl(id,s.id,s.first)}}])}};
  if (!['card','answer'].includes(action) || !def.scaleOrder.includes(scale) || !/^(0|[1-9]\d{0,3})$/.test(position ?? '') || !['l','q'].includes(mode)) return null;
  if ((action === 'card' && parts.length !== 6) || (action === 'answer' && (parts.length !== 7 || mode !== 'q' || !['Y','N'].includes(selected)))) return null;
  const numbers = [...new Set([...def.key[scale].yes,...def.key[scale].no])].sort((a,b) => a-b);
  const number = numbers[Number(position)];
  if (!number) return null;
  return {text:`${def.title} · ${def.scaleInfo[scale].code}: ${def.scaleInfo[scale].title}\n\nПункт № ${number}. Откройте вопрос в приложении.`,reply_markup:{inline_keyboard:[[{text:'Открыть вопрос',web_app:{url:studyUrl(id,scale,number)}}]]}};
}

export function trainingWidgetHtml():string {
  const definitions = Object.values(QUESTIONNAIRES);
  const tabs = definitions.map((def,i) => `<button data-test="${def.id}" id="tab-${def.id}"${i === 0 ? ' disabled' : ''} onclick="choose('${def.id}')">${escapeHtml(def.title)}</button>`).join('');
  const sections = definitions.map((def,i) => `<section id="${def.id}"${i ? ' hidden' : ''}><div class="scales">${studyScales(def).map(s => `<button data-scale="${s.id}" onclick="TelegramWidget.openTelegramLink('https://t.me/${BOT_USERNAME}/study?startapp=study_${def.id}_${s.id}_${s.first}')">${escapeHtml(s.code)}: ${escapeHtml(s.title)}</button>`).join('')}</div></section>`).join('');
  return `<html><head><style>body{font:14px system-ui}h3{margin:0 0 12px}.tabs{display:flex;gap:6px;margin-bottom:12px}.tabs button{flex:1;min-height:40px}.scales{display:grid;grid-template-columns:1fr 1fr;gap:6px}@media(min-width:480px){.scales{grid-template-columns:repeat(3,1fr)}}.scales button{min-height:42px;text-align:left;padding:8px;font:inherit}p{color:var(--tg-theme-hint-color);margin:12px 0 0;font-size:12px}</style></head><body><h3>Изучение шкал</h3><div class="tabs">${tabs}</div>${sections}<p>Выберите шкалу. Вопросы и ответы по ключу откроются в приложении.</p><script>function choose(id){['smol','smil','mmil'].forEach(function(t){document.getElementById(t).hidden=t!==id;document.getElementById('tab-'+t).disabled=t===id})}TelegramWidget.ready();</script></body></html>`;
}
