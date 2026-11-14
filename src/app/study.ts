import { api } from './api';
import { escapeHtml as h } from './html';
import { createScope } from './scope';
import { studyHash, type StudyResponse, type StudyRoute } from './studyRoute';
import './study.css';

export function mountStudy(root:HTMLElement, initial:StudyRoute):() => void {
  const scope = createScope();
  let data:StudyResponse | null = null;
  let route = {...initial};
  let mode:'learn'|'quiz' = 'learn';
  let answer:string | null = null;
  let busy = false;
  const label = (a:string) => a === 'Y' ? 'Да' : 'Нет';
  const option = (value:string,text:string,selected:boolean) => `<option value="${h(value)}"${selected ? ' selected' : ''}>${h(text)}</option>`;
  function render(error = '') {
    const focused = (document.activeElement as HTMLElement | null)?.id;
    const q = data?.questions.find(q => q.number === route.question);
    const index = q && data ? data.questions.indexOf(q) : -1;
    const revealed = mode === 'learn' || answer !== null;
    root.innerHTML = `<section class="study wrap" aria-busy="${busy}">
      <header class="study-head"><div><p class="study-eyebrow">Изучение шкал</p><h1>${h(data?.title ?? 'Тренажёр')}</h1></div><button class="btn" id="studyExit">Полный тест</button></header>
      ${data ? `<div class="study-controls"><label>Шкала<select id="studyScale">${data.scales.map(s => option(s.id,`${s.code}: ${s.title}`,s.id === route.scale)).join('')}</select></label><label>Вопрос<select id="studyQuestion">${data.questions.map((q,i) => option(String(q.number),`${i+1} из ${data!.questions.length} · № ${q.number}`,q.number === route.question)).join('')}</select></label></div>` : ''}
      ${error ? `<div class="study-error" role="alert"><p>${h(error)}</p><button class="btn" id="studyRetry">Повторить</button></div>` : ''}
      ${busy ? '<p role="status">Загрузка вопросов…</p>' : ''}
      ${data && !q ? '<p role="alert">Этот пункт не входит в выбранную шкалу.</p><button class="btn" id="studyFirst">Открыть первый вопрос</button>' : ''}
      ${q && data ? `<div class="study-modes" role="group" aria-label="Режим изучения"><button class="btn" id="studyLearn" aria-pressed="${mode === 'learn'}">Изучение</button><button class="btn" id="studyQuiz" aria-pressed="${mode === 'quiz'}">Самопроверка</button></div>
      <article class="study-card" aria-live="polite"><p class="study-eyebrow">${h(data.scale.code)}: ${h(data.scale.title)} · ${index+1} из ${data.questions.length}</p><h2>Пункт № ${q.number}</h2><p class="study-question-text">${h(q.text)}</p>
      ${mode === 'quiz' ? `<p>Какой ответ добавляет балл к этой шкале?</p><div class="study-answer-buttons">${['Y','N'].map(a => `<button class="btn" data-study-answer="${a}" aria-pressed="${answer === a}">${label(a)}</button>`).join('')}</div>` : ''}
      ${answer !== null ? `<p class="study-feedback" role="status">${q.answers.includes(answer as 'Y'|'N') ? 'Совпадает с ключом.' : 'Не совпадает с ключом.'}</p>` : ''}
      ${revealed ? `<div class="study-key"><strong>Ответ по ключу: ${q.answers.map(a => `«${label(a)}»`).join(' или ')}.</strong><p>Такой ответ добавляет 1 сырой балл к выбранной шкале.</p></div>` : ''}
      </article><nav class="study-nav" aria-label="Вопросы шкалы"><button class="btn" id="studyPrev" ${index === 0 ? 'disabled' : ''}>← Назад</button><span>${index+1} / ${data.questions.length}</span><button class="btn" id="studyNext" ${index === data.questions.length-1 ? 'disabled' : ''}>Далее →</button></nav>${index === data.questions.length-1 ? '<p class="study-end">Последний вопрос шкалы.</p>' : ''}` : ''}
    </section>`;
    if (focused) root.querySelector<HTMLElement>(`#${focused}`)?.focus({preventScroll:true});
  }
  function go(number:number) {
    route = {...route,question:number}; answer = null;
    history.replaceState(null,'',studyHash(route)); render();
  }
  async function load() {
    busy = true; render();
    try {
      data = await api<StudyResponse>(`api/questionnaire/${route.test}/study/${route.scale}`,{signal:scope.signal});
      if (scope.signal.aborted) return;
      busy = false; render();
    } catch {
      if (scope.signal.aborted) return;
      busy = false; render('Не удалось загрузить вопросы. Проверьте соединение и повторите попытку.');
    }
  }
  scope.on(root,'click',event => {
    const el = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!el) return;
    if (el.id === 'studyExit') { location.hash = route.test; return; }
    if (el.id === 'studyRetry') { if (!busy) void load(); return; }
    if (!data) return;
    const index = data.questions.findIndex(q => q.number === route.question);
    if (el.id === 'studyFirst') go(data.questions[0].number);
    if (el.id === 'studyPrev' && index > 0) go(data.questions[index-1].number);
    if (el.id === 'studyNext' && index >= 0 && index < data.questions.length-1) go(data.questions[index+1].number);
    if (el.id === 'studyLearn' || el.id === 'studyQuiz') { mode = el.id === 'studyLearn' ? 'learn' : 'quiz'; answer = null; render(); }
    if (el.dataset.studyAnswer) { answer = el.dataset.studyAnswer; render(); }
  });
  scope.on(root,'change',event => {
    const el = event.target as HTMLSelectElement;
    if (!data) return;
    if (el.id === 'studyQuestion') go(Number(el.value));
    if (el.id === 'studyScale') {
      const scale = data.scales.find(s => s.id === el.value);
      if (scale) location.hash = studyHash({...route,scale:scale.id,question:scale.first});
    }
  });
  void load();
  return () => scope.dispose();
}
