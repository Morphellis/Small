import { QUESTIONNAIRES } from './registry';

export const TRAINER_URL = 'https://small.morphellis.workers.dev/';
export interface TrainingButton { text: string; callback_data?: string; web_app?: {url:string} }
export interface TrainingView { text:string; reply_markup:{inline_keyboard:TrainingButton[][]} }
const button = (text:string, callback_data:string):TrainingButton => ({text,callback_data});
const view = (text:string, rows:TrainingButton[][]):TrainingView => ({text,reply_markup:{inline_keyboard:rows}});

export function trainingHome():TrainingView {
  return view('Small — тренажёр психологических тестов.\n\nДоступны СМОЛ, СМИЛ, ММИЛ и тест Люшера.\n\nОткройте тренажёр для полного прохождения или выберите тест для изучения вопросов по шкалам.', [
    [{text:'Открыть тренажёр',web_app:{url:TRAINER_URL}}],
    ...Object.values(QUESTIONNAIRES).map(def => [button(def.title,`t1:test:${def.id}`)])
  ]);
}

export function trainingView(data:string):TrainingView | null {
  if (data === 't1:home') return trainingHome();
  const parts = data.split(':');
  if (parts[0] !== 't1') return null;
  const [,action,id,scale,position,mode,selected] = parts;
  if (!Object.hasOwn(QUESTIONNAIRES,id ?? '')) return null;
  const def = QUESTIONNAIRES[id];
  if (action === 'test' && parts.length === 3) {
    const rows = def.scaleOrder.filter(s => def.key[s].yes.length + def.key[s].no.length > 0).map(s => [
      button(`${def.scaleInfo[s].code}: ${def.scaleInfo[s].title}`,`t1:card:${id}:${s}:0:l`)
    ]);
    return view(`${def.title}\n\nВыберите шкалу. В режиме изучения ответ по ключу показан сразу. В режиме самопроверки сначала выберите свой ответ.`, [...rows,[button('Выбрать тест','t1:home')]]);
  }
  if (!['card','answer'].includes(action) || !def.scaleOrder.includes(scale) || !/^(0|[1-9]\d{0,3})$/.test(position ?? '') || !['l','q'].includes(mode)) return null;
  if ((action === 'card' && parts.length !== 6) || (action === 'answer' && (parts.length !== 7 || mode !== 'q' || !['Y','N'].includes(selected)))) return null;
  const key = def.key[scale];
  const numbers = [...new Set([...key.yes,...key.no])].sort((a,b) => a-b);
  const index = Number(position);
  if (index >= numbers.length) return null;
  const n = numbers[index];
  const expected = [...(key.yes.includes(n) ? ['Y'] : []),...(key.no.includes(n) ? ['N'] : [])];
  const label = (a:string) => a === 'Y' ? 'Да' : 'Нет';
  const keyText = `Ответ по ключу: ${expected.map(a => `«${label(a)}»`).join(' или ')}.\nТакой ответ добавляет 1 сырой балл к выбранной шкале.`;
  let text = `${def.title} · ${def.scaleInfo[scale].code}: ${def.scaleInfo[scale].title}\nВопрос ${index+1} из ${numbers.length} · Пункт № ${n}\n\n${def.questions[n-1]}`;
  const rows:TrainingButton[][] = [];
  const callback = (i:number,m = mode) => `t1:card:${id}:${scale}:${i}:${m}`;
  if (mode === 'l') text += `\n\n${keyText}`;
  else if (action === 'answer') text += `\n\nВаш ответ: «${label(selected)}». ${expected.includes(selected) ? 'Совпадает с ключом.' : 'Не совпадает с ключом.'}\n${keyText}`;
  else {
    text += '\n\nКакой ответ добавляет балл к этой шкале?';
    rows.push(['Y','N'].map(a => button(label(a),`t1:answer:${id}:${scale}:${index}:q:${a}`)));
  }
  if (index === numbers.length-1 && (mode === 'l' || action === 'answer')) text += '\n\nЭто последний вопрос шкалы.';
  const nav:TrainingButton[] = [];
  if (index > 0) nav.push(button('← Назад',callback(index-1)));
  if (index < numbers.length-1) nav.push(button('Далее →',callback(index+1)));
  if (nav.length) rows.push(nav);
  rows.push([button(mode === 'l' ? 'Самопроверка' : 'Показать ключ',callback(index,mode === 'l' ? 'q' : 'l'))]);
  rows.push([button('Выбрать шкалу',`t1:test:${id}`),button('Выбрать тест','t1:home')]);
  return view(text,rows);
}
