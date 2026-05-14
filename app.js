(() => {
  'use strict';

  const STORAGE = 'assistant-phone-v6-minimal-state'; // mantener para no perder datos
  const APP_VERSION = 'v8-competitive-local';
  const $ = (id) => document.getElementById(id);
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];
  const uid = (p = 'id') => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const DOW = ['Do','Lu','Ma','Mi','Ju','Vi','Sa'];
  const CURRENCY = { USD:'$', MXN:'$', COP:'$', EUR:'€', CLP:'$', PEN:'S/' };

  const localDate = (date = new Date()) => {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const addDays = (n, base = new Date()) => { const d = new Date(base); d.setDate(d.getDate() + n); return localDate(d); };
  const parseLocal = (s) => { const [y,m,d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  const today = () => localDate(new Date());
  const nowTime = () => new Date().toLocaleTimeString('es', {hour:'2-digit', minute:'2-digit'});
  const fmtDate = (s) => {
    if (!s) return 'Sin fecha';
    if (s === today()) return 'Hoy';
    if (s === addDays(1)) return 'Mañana';
    if (s === addDays(-1)) return 'Ayer';
    return parseLocal(s).toLocaleDateString('es', { day:'numeric', month:'short' });
  };
  const fmtLongDate = (s) => parseLocal(s).toLocaleDateString('es', { weekday:'long', day:'numeric', month:'long' });
  const daysBetween = (a, b) => Math.round((parseLocal(a) - parseLocal(b)) / 86400000);
  const isOverdue = (t) => !t.done && t.due && t.due < today();
  const isToday = (s) => s === today();
  const monthKey = (s = today()) => s.slice(0,7);

  function makeDefaults() {
    const t = today();
    const categories = [
      { id:'food', name:'Comida', icon:'🍎', color:'#00d68f', budget:600 },
      { id:'home', name:'Vivienda', icon:'🏠', color:'#38bdf8', budget:1200 },
      { id:'transport', name:'Transporte', icon:'🚗', color:'#ffb340', budget:300 },
      { id:'health', name:'Salud', icon:'❤️', color:'#ff4d6d', budget:180 },
      { id:'fun', name:'Entretenimiento', icon:'🎬', color:'#9b7ffe', budget:240 },
      { id:'other', name:'Otros', icon:'📦', color:'#f472b6', budget:250 }
    ];
    return {
      settings:{ onboarded:false, userName:'Byron', assistantName:'Jarvis', accent:'#7c5cfc', theme:'auto', density:'comfortable', mode:'simple', currency:'USD', pinEnabled:false, privacyMode:false, profile:'Personal', homeLayout:'minimal', showMonthCalendar:false, deviceNotifications:false, plannerEnergy:'normal', plannerMinutes:60 },
      projects:[
        {id:'personal', name:'Personal', icon:'🌱', color:'#00d68f', profile:'Personal'},
        {id:'work', name:'Trabajo', icon:'💼', color:'#38bdf8', profile:'Trabajo'},
        {id:'health', name:'Salud', icon:'❤️', color:'#ff4d6d', profile:'Personal'},
        {id:'money', name:'Finanzas', icon:'💰', color:'#9b7ffe', profile:'Personal'},
        {id:'home', name:'Hogar', icon:'🏠', color:'#ffb340', profile:'Personal'}
      ],
      categories,
      tasks:[],
      events:[],
      transactions:[],
      habits:[],
      notes:[],
      moods:{},
      notifications:[],
      alarmLog:{},
      chat:[{role:'ai',text:'Hola, soy tu asistente local. Puedo crear tareas, planificar tu día, registrar gastos y sugerirte qué hacer primero.',time:nowTime(),actions:[{label:'Plan del día',action:'assistant:plan'},{label:'Qué hago primero',action:'assistant:first'}]}],
      undo:null,
      xp:0,
      streak:0,
      pom:{seconds:1500,total:1500,running:false,mode:'work',sessions:0},
      view:'home',
      taskFilter:'all',projectFilter:'all',calendar:{year:new Date().getFullYear(),month:new Date().getMonth(),selected:t}
    };
  }

  let state = loadState();
  let pomTimer = null;
  let speech = null;
  let deferredPrompt = null;
  let pinEntry = '';

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (!raw) return makeDefaults();
      const parsed = JSON.parse(raw);
      return mergeDeep(makeDefaults(), parsed);
    } catch { return makeDefaults(); }
  }
  function mergeDeep(base, incoming) {
    if (Array.isArray(base)) return Array.isArray(incoming) ? incoming : base;
    if (!base || typeof base !== 'object') return incoming ?? base;
    const out = {...base};
    if (incoming && typeof incoming === 'object') Object.keys(incoming).forEach(k => out[k] = mergeDeep(base[k], incoming[k]));
    return out;
  }
  function save() { localStorage.setItem(STORAGE, JSON.stringify(state)); }
  function sync() { save(); applyTheme(); render(); }
  function toast(msg, ms=2600) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(()=>el.classList.remove('show'), ms); }

  function applyTheme() {
    const s = state.settings;
    document.documentElement.style.setProperty('--accent', s.accent);
    document.documentElement.style.setProperty('--accentA', hexToRgba(s.accent, .26));
    document.body.classList.toggle('density-compact', s.density === 'compact');
    document.body.classList.toggle('density-large', s.density === 'large');
    document.body.classList.toggle('theme-neon', s.theme === 'neon');
    document.body.classList.toggle('theme-exec', s.theme === 'exec');
    const lightAuto = s.theme === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    document.body.classList.toggle('theme-light', s.theme === 'light' || lightAuto);
    $('brand-sub').textContent = `${s.assistantName} · ${navigator.onLine ? 'Online' : 'Offline listo'}`;
    $('brand-mark').textContent = s.assistantName.toLowerCase().includes('nova') ? '⭐' : s.assistantName.toLowerCase().includes('max') ? '⚡' : '🤖';
    const status = $('online-state');
    if (status) status.innerHTML = `<span class="statusDot${navigator.onLine?'':' off'}"></span>${navigator.onLine?'Online':'Offline listo'}`;
  }
  function hexToRgba(hex, a) {
    const h = String(hex).replace('#','');
    const n = parseInt(h.length === 3 ? h.split('').map(x=>x+x).join('') : h, 16);
    return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
  }

  function money(n, opts={}) {
    if (state.settings.privacyMode && opts.private) return '••••';
    const symbol = CURRENCY[state.settings.currency] || '$';
    const decimals = ['COP','CLP'].includes(state.settings.currency) ? 0 : 0;
    return `${symbol}${Number(n||0).toLocaleString('es', {minimumFractionDigits:decimals, maximumFractionDigits:decimals})}`;
  }
  function project(id) { return state.projects.find(p => p.id === id) || state.projects[0]; }
  function category(id) { return state.categories.find(c => c.id === id) || state.categories[0]; }
  function visibleTasks() { return state.settings.privacyMode ? state.tasks.filter(t => !t.private) : state.tasks; }
  function pendingTasks() { return visibleTasks().filter(t => !t.done); }
  function completedThisWeek() {
    const start = addDays(-6);
    return state.tasks.filter(t => t.done && t.completedAt && t.completedAt >= start).length;
  }
  function incomeMonth() { return state.transactions.filter(x=>x.type==='income' && monthKey(x.date)===monthKey()).reduce((s,x)=>s+x.amount,0); }
  function expenseMonth() { return state.transactions.filter(x=>x.type==='expense' && monthKey(x.date)===monthKey()).reduce((s,x)=>s+x.amount,0); }
  function budgetMonth() { return state.categories.reduce((s,c)=>s+(Number(c.budget)||0),0); }
  function dailyAvailable() {
    const d = new Date(); const last = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
    const daysLeft = Math.max(1, last - d.getDate() + 1);
    return (incomeMonth() - expenseMonth()) / daysLeft;
  }
  function habitsDoneToday() { return state.habits.filter(h => Number(h.log[today()] || 0) >= Number(h.goal || 1)).length; }

  function getViews() {
    const base = [
      {id:'home',label:'Inicio',icon:'🏠',sub:'Simple y limpio'},
      {id:'today',label:'Hoy',icon:'☀️',sub:'Lo necesario para hoy'},
      {id:'tasks',label:'Tareas',icon:'✅',sub:'Lista simple'},
      {id:'calendar',label:'Calendario',icon:'📅',sub:'Agenda primero'},
      {id:'assistant',label:state.settings.assistantName,icon:'🤖',sub:'Asistente local sin API'},
      {id:'settings',label:'Config',icon:'⚙️',sub:'Personalización, backup e instalación'}
    ];
    const advanced = [
      {id:'finance',label:'Dinero',icon:'💰',sub:'Balance, presupuesto y gastos'},
      {id:'habits',label:'Hábitos',icon:'🌱',sub:'Salud, rachas y ánimo'},
      {id:'notes',label:'Notas',icon:'📝',sub:'Ideas rápidas y convertir en tareas'},
      {id:'kanban',label:'Kanban',icon:'🗂️',sub:'Flujo de trabajo'},
      {id:'insights',label:'Insights',icon:'📊',sub:'Resumen semanal y patrones'}
    ];
    if (state.settings.mode === 'advanced') base.splice(4, 0, ...advanced);
    return base;
  }
  function setView(id) {
    const advancedOnly = ['finance','habits','kanban','insights'];
    if (!getViews().some(v=>v.id===id) && advancedOnly.includes(id)) state.settings.mode = 'advanced';
    state.view = id; save(); render(); setTimeout(()=>$('content')?.focus(),0);
  }
  function renderNav() {
    const views = getViews();
    const btns = views.map(v=>`<button class="navBtn ${state.view===v.id?'active':''}" data-view="${v.id}" type="button"><span class="navIcon">${v.icon}</span><span>${esc(v.label)}</span></button>`).join('');
    $('side-nav').innerHTML = btns;
    const mobile = ['home','today','tasks','calendar','assistant'].map(id => views.find(v=>v.id===id)).filter(Boolean);
    $('mobile-nav').innerHTML = mobile.map(v=>`<button class="navBtn ${state.view===v.id?'active':''}" data-view="${v.id}" type="button"><span class="navIcon">${v.icon}</span><span>${esc(v.label)}</span></button>`).join('');
  }
  function render() {
    applyTheme(); renderNav();
    const view = getViews().find(v=>v.id===state.view) || getViews()[0];
    $('page-title').textContent = view.label;
    $('page-subtitle').textContent = view.sub;
    const map = {home:renderHome,today:renderToday,tasks:renderTasks,calendar:renderCalendar,finance:renderFinance,habits:renderHabits,notes:renderNotes,kanban:renderKanban,assistant:renderAssistant,insights:renderInsights,settings:renderSettings};
    $('content').innerHTML = (map[view.id] || renderHome)();
    attachViewEvents(view.id);
  }

  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  }
  function currentBackgroundHint() {
    const h = new Date().getHours();
    if (h < 12) return 'Modo mañana';
    if (h < 19) return 'Modo tarde';
    return 'Modo noche';
  }

  function hasAnyData() {
    return state.tasks.length || state.events.length || state.habits.length || state.transactions.length;
  }
  function dashboardSummaryText() {
    const parts = [];
    const todayTasks = pendingTasks().filter(t => t.due === today()).length;
    const todayEvents = state.events.filter(e => e.date === today()).length;
    const habitsPending = state.habits.filter(h => Number(h.log[today()] || 0) < Number(h.goal || 1)).length;
    if (todayTasks) parts.push(`${todayTasks} tarea${todayTasks===1?'':'s'} para hoy`);
    if (todayEvents) parts.push(`${todayEvents} evento${todayEvents===1?'':'s'}`);
    if (habitsPending) parts.push(`${habitsPending} hábito${habitsPending===1?'':'s'} pendiente${habitsPending===1?'':'s'}`);
    return parts.length ? parts.join(' · ') : 'Tu día está limpio.';
  }
  function renderAddStrip(title='Agregar algo') {
    return `<section class="addStrip softAdd" aria-label="Acciones rápidas">
      <div><strong>${esc(title)}</strong><span>Una acción a la vez. Puedes añadir más después.</span></div>
      <div class="addChoices">
        <button class="btn primary" data-action="open-capture" type="button">＋ Captura rápida</button>
        <button class="btn ghost" data-action="new-task" type="button">Tarea</button>
        <button class="btn ghost" data-action="new-event" type="button">Evento</button>
        <button class="btn ghost" data-action="new-habit" type="button">Hábito</button>
        <button class="btn ghost" data-action="new-finance" type="button">Gasto</button>
      </div>
    </section>`;
  }
  function renderEmptyClean(icon, title, text, action='new-task', label='Agregar tarea') {
    return `<section class="emptyClean">
      <div class="emptyIcon">${icon}</div>
      <h2>${esc(title)}</h2>
      <p>${esc(text)}</p>
      <button class="btn primary" data-action="${action}" type="button">${esc(label)}</button>
    </section>`;
  }
  function renderSimpleMetric(label, value) {
    return `<div class="simpleMetric"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  }

  function renderCaptureBox(title='Captura rápida') {
    return `<section class="quickCapture card cleanCard">
      <form class="captureForm">
        <label>${esc(title)}</label>
        <div class="captureRow">
          <input class="input" name="capture" autocomplete="off" placeholder="Ej: pagar internet mañana 9am">
          <button class="btn primary" type="submit">Agregar</button>
        </div>
        <p class="muted small">También entiende: “evento reunión viernes 15:00”, “gasto 20 comida”, “hábito leer 20:00”, “nota idea”.</p>
      </form>
    </section>`;
  }

  function explainRecommendation(t) {
    if (!t) return 'No hay tareas pendientes. Buen momento para planear algo nuevo.';
    const reasons = [];
    if (isOverdue(t)) reasons.push('está vencida');
    else if (t.due === today()) reasons.push('vence hoy');
    else if (t.due === addDays(1)) reasons.push('vence mañana');
    if (t.priority === 'alta') reasons.push('es alta prioridad');
    if ((t.estimate || 25) <= 15) reasons.push('es rápida');
    if (t.status === 'doing') reasons.push('ya está en progreso');
    return reasons.length ? `Porque ${reasons.join(', ')}.` : `Porque es la siguiente tarea más conveniente.`;
  }

  function renderHome() {
    const any = hasAnyData();
    const next = recommendTask();
    const eventsToday = state.events.filter(e => e.date === today()).sort((a,b)=>a.start.localeCompare(b.start));
    const tasksToday = pendingTasks().filter(t => t.due === today()).sort(sortTasks);
    const overdue = pendingTasks().filter(isOverdue);
    const firstEvent = eventsToday[0];
    if (!any) {
      return `
        <section class="minimalHero">
          <div class="heroSmall">${esc(currentBackgroundHint())}</div>
          <h2>${greeting()}, ${esc(state.settings.userName)}</h2>
          <p>Tu espacio está limpio. Captura una tarea, evento, gasto, hábito o nota con una frase.</p>
          <button class="btn primary" data-action="open-capture" type="button">＋ Captura rápida</button>
        </section>
        ${renderCaptureBox('Escribe lo primero que quieres organizar')}
        ${renderAddStrip('También puedes agregar')}
        <section class="hintLine">
          <strong>Tip:</strong> Mantén tu inicio simple. Las secciones aparecen solo cuando aportan algo.
        </section>`;
    }
    const cards = [];
    if (overdue.length) cards.push(`<section class="subtleCard attention"><div><strong>${overdue.length} vencida${overdue.length===1?'':'s'}</strong><span>Conviene reprogramar o resolver.</span></div><button class="chip danger" data-action="move-overdue" type="button">Mover a mañana</button></section>`);
    if (next) cards.push(`<section class="card cleanCard nextAction"><div class="between"><h3 class="sectionTitle">Siguiente mejor acción</h3><button class="chip" data-view="tasks" type="button">Tareas</button></div>${renderTaskMini(next,true)}<p class="muted small">${esc(explainRecommendation(next))}</p><div class="row wrap"><button class="btn primary" data-action="focus" data-id="${next.id}" type="button">Enfocarme</button><button class="btn ghost" data-action="postpone" data-id="${next.id}" data-days="1" type="button">Mañana</button></div></section>`);
    if (firstEvent) cards.push(`<section class="card cleanCard"><div class="between"><h3 class="sectionTitle">Próximo evento</h3><button class="chip" data-view="calendar" type="button">Calendario</button></div>${renderEventMini(firstEvent)}</section>`);
    const todayBits = [];
    if (tasksToday.length) todayBits.push(renderSimpleMetric('Tareas hoy', String(tasksToday.length)));
    if (eventsToday.length) todayBits.push(renderSimpleMetric('Eventos', String(eventsToday.length)));
    if (state.habits.length) todayBits.push(renderSimpleMetric('Hábitos', `${habitsDoneToday()}/${state.habits.length}`));
    return `
      <section class="minimalHero">
        <div class="heroSmall">${esc(currentBackgroundHint())}</div>
        <h2>${greeting()}, ${esc(state.settings.userName)}</h2>
        <p>${esc(dashboardSummaryText())}</p>
        <div class="row wrap">
          <button class="btn primary" data-action="open-quick" type="button">＋ Agregar</button>
          <button class="btn ghost" data-view="today" type="button">Ver hoy</button>
        </div>
      </section>
      ${todayBits.length ? `<section class="simpleMetrics">${todayBits.join('')}</section>` : ''}
      <div class="linearStack">${cards.join('')}</div>
      ${renderCaptureBox('Captura algo nuevo')}
      ${renderAddStrip('Agregar más')}`;
  }
  function nextEventLabel() {
    const upcoming = [...state.events].filter(e => e.date >= today()).sort((a,b)=>`${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`))[0];
    return upcoming ? `${upcoming.start} ${upcoming.title}` : 'Sin eventos';
  }
  function buildNotifications() {
    const out = [];
    if (state.undo) out.push({type:'undo',icon:'↩️',title:'Elemento eliminado',text:'Puedes deshacer la última eliminación.',actions:[{label:'Deshacer',action:'undo-delete'}]});
    const overdue = pendingTasks().filter(isOverdue);
    if (overdue.length) out.push({type:'danger',icon:'⚠️',title:`${overdue.length} tareas vencidas`,text:'Reprograma o resuelve las tareas atrasadas.',actions:[{label:'Reprogramar a mañana',action:'move-overdue'},{label:'Ver',action:'view-tasks'}]});
    const nextEv = state.events.filter(e => e.date === today()).sort((a,b)=>a.start.localeCompare(b.start))[0];
    if (nextEv) out.push({type:'info',icon:'📅',title:'Evento de hoy',text:`${nextEv.start} · ${nextEv.title}`,actions:[{label:'Calendario',action:'view-calendar'}]});
    const budget = budgetMonth();
    if (budget && expenseMonth()/budget > .85) out.push({type:'warn',icon:'💸',title:'Presupuesto alto',text:`Has usado ${Math.round(expenseMonth()/budget*100)}% del presupuesto mensual.`,actions:[{label:'Ver dinero',action:'view-finance'}]});
    const missing = state.habits.filter(h => Number(h.log[today()]||0) < Number(h.goal||1));
    if (missing.length) out.push({type:'ok',icon:'🌱',title:'Hábitos pendientes',text:`Te faltan ${missing.length} hábitos de hoy.`,actions:[{label:'Ver hábitos',action:'view-habits'}]});
    return out.concat(state.notifications || []);
  }
  function renderNotification(n) {
    const acts = (n.actions||[]).map(a=>`<button class="chip" data-action="${esc(a.action)}" type="button">${esc(a.label)}</button>`).join('');
    return `<div class="listItem"><div class="row"><span>${esc(n.icon||'🔔')}</span><div><strong>${esc(n.title)}</strong><div class="muted small">${esc(n.text)}</div></div></div>${acts?`<div class="row wrap" style="margin-top:8px">${acts}</div>`:''}</div>`;
  }
  function renderTaskMini(t, showProject=false) {
    const p = project(t.project);
    const cls = `${t.priority==='alta'&&!t.done?' urgent':''}${t.done?' done':''}${state.settings.privacyMode&&t.private?' privateHidden':''}`;
    const meta = [];
    if (t.due) meta.push(fmtDate(t.due));
    if (t.priority && t.priority !== 'media') meta.push(t.priority);
    if (t.reminder) meta.push('🔔 '+timeLabel(t.reminder));
    return `<article class="task simpleTask touchTask${cls}">
      <button class="check ${t.done?'done':''}" data-action="toggle-task" data-id="${t.id}" aria-label="Completar tarea">${t.done?'✓':''}</button>
      <button class="taskMain privateText" data-action="task-detail" data-id="${t.id}" type="button" aria-label="Ver detalles de ${esc(t.title)}">
        <span class="taskTitle">${t.private?'🔒 ':''}${esc(t.title)}</span>
        <span class="taskSub">${meta.length?esc(meta.join(' · ')):'Sin fecha'}</span>
      </button>
      <button class="taskMore" data-action="task-detail" data-id="${t.id}" type="button" aria-label="Más opciones">›</button>
    </article>`;
  }

  function renderTaskDetail(t) {
    const p = project(t.project);
    const subtasks = t.subtasks?.length ? `<div class="detailBlock"><h4>Subtareas</h4>${t.subtasks.map(s=>`<div class="subtask ${s.done?'done':''}"><button data-action="toggle-subtask" data-task="${t.id}" data-id="${s.id}" type="button"></button>${esc(s.text)}</div>`).join('')}</div>` : '';
    const note = t.note ? `<div class="detailBlock"><h4>Nota</h4><p>${esc(t.note)}</p></div>` : '';
    return `<div class="detailHeader">
        <div><p class="eyebrow">Tarea</p><h2 id="task-detail-title">${t.private?'🔒 ':''}${esc(t.title)}</h2></div>
        <button class="iconBtn closeModal" type="button" aria-label="Cerrar">×</button>
      </div>
      <div class="detailMeta">
        <span>${esc(fmtDate(t.due))}</span>
        <span>${esc(t.priority)}</span>
        ${t.estimate?`<span>${t.estimate} min</span>`:''}
        ${t.reminder?`<span>🔔 ${esc(timeLabel(t.reminder))}</span>`:''}
        <span style="color:${p.color}">${p.icon} ${esc(p.name)}</span>
      </div>
      ${note}
      ${subtasks}
      <div class="detailActions">
        <button class="btn primary" data-action="toggle-task" data-id="${t.id}" type="button">${t.done?'Reabrir':'Completar'}</button>
        <button class="btn ghost" data-action="postpone" data-id="${t.id}" data-days="1" type="button">Mañana</button>
        <button class="btn ghost" data-action="edit-task" data-id="${t.id}" type="button">Editar</button>
        <button class="btn danger" data-action="delete-task" data-id="${t.id}" type="button">Eliminar</button>
      </div>`;
  }

  function openTaskDetail(id) {
    const t = state.tasks.find(x=>x.id===id);
    if (!t) return;
    $('task-detail-content').innerHTML = renderTaskDetail(t);
    openModal('task-detail-modal');
  }


  function renderToday() {
    const overdue = pendingTasks().filter(isOverdue);
    const todayList = pendingTasks().filter(t=>t.due===today()).sort(sortTasks);
    const events = state.events.filter(e=>e.date===today()).sort((a,b)=>a.start.localeCompare(b.start));
    const habits = state.habits.filter(h => Number(h.log[today()] || 0) < Number(h.goal || 1));
    const hasToday = overdue.length || todayList.length || events.length || habits.length;
    if (!hasAnyData()) {
      return `${renderEmptyClean('☀️','Hoy está vacío','Agrega una tarea o evento para empezar a construir tu día.','new-task','Crear tarea')}${renderAddStrip('Planear hoy')}`;
    }
    if (!hasToday) {
      return `${renderEmptyClean('✨','Nada pendiente hoy','No tienes tareas, eventos ni hábitos pendientes para hoy.','open-quick','Agregar algo')}${renderAddStrip('Agregar para hoy')}`;
    }
    const sections = [];
    if (overdue.length) sections.push(`<section class="card cleanCard"><div class="between"><h3 class="sectionTitle">Vencidas</h3><button class="chip danger" data-action="move-overdue" type="button">Mover a mañana</button></div><div class="stack">${overdue.map(t=>renderTaskMini(t,true)).join('')}</div></section>`);
    if (todayList.length) sections.push(`<section class="card cleanCard"><div class="between"><h3 class="sectionTitle">Tareas de hoy</h3><button class="chip" data-action="new-task" type="button">＋</button></div><div class="stack">${todayList.map(t=>renderTaskMini(t,true)).join('')}</div></section>`);
    if (events.length) sections.push(`<section class="card cleanCard"><div class="between"><h3 class="sectionTitle">Agenda</h3><button class="chip" data-action="new-event" data-date="${today()}" type="button">＋</button></div><div class="agendaList">${events.map(renderEventMini).join('')}</div></section>`);
    if (habits.length) sections.push(`<section class="card cleanCard"><div class="between"><h3 class="sectionTitle">Hábitos</h3><button class="chip" data-action="new-habit" type="button">＋</button></div><div class="simpleHabitList">${habits.map(h=>`<div class="simpleHabit"><span>${h.icon} ${esc(h.name)}</span><button class="chip" data-action="habit-inc" data-id="${h.id}" type="button">Marcar</button></div>`).join('')}</div></section>`);
    const quickTime = pendingTasks().length ? `<section class="card cleanCard"><h3 class="sectionTitle">Tengo tiempo para...</h3><div class="row wrap"><button class="btn ghost" data-action="time-filter" data-min="5">5 min</button><button class="btn ghost" data-action="time-filter" data-min="15">15 min</button><button class="btn ghost" data-action="time-filter" data-min="30">30 min</button><button class="btn ghost" data-action="time-filter" data-min="60">1 hora</button></div><div id="time-suggestions" style="margin-top:12px"></div></section>` : '';
    return `<section class="pageIntro"><h2>Hoy</h2><p>${esc(dashboardSummaryText())}</p></section>${renderCaptureBox('Agregar a hoy con una frase')}<div class="linearStack">${sections.join('')}${quickTime}</div>${renderAddStrip('Agregar al día')}`;
  }
  function generateDayPlan() {
    const items = [];
    state.events.filter(e=>e.date===today()).forEach(e=>items.push({time:e.start,title:e.title,meta:`Evento · ${e.location||'Sin ubicación'}`}));
    let hour = 10, minute = 0;
    pendingTasks().filter(t=>t.due<=today() || t.priority==='alta').sort(sortTasks).slice(0,5).forEach(t=>{
      items.push({time:`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`,title:t.title,meta:`Tarea ${t.priority} · ${t.estimate||25} min`});
      minute += Number(t.estimate || 25); while (minute >= 60) { hour++; minute -= 60; }
    });
    state.habits.filter(h=>Number(h.log[today()]||0) < h.goal).slice(0,3).forEach(h=>items.push({time:'Hoy',title:`${h.icon} ${h.name}`,meta:`Hábito · meta ${h.goal} ${h.unit}`}));
    return items.sort((a,b)=>a.time.localeCompare(b.time));
  }
  function renderEventMini(e) { return `<button class="eventItem eventButton" data-action="event-detail" data-id="${e.id}" type="button"><span class="dot" style="background:${e.color}"></span><span><strong>${esc(e.title)}</strong><small>${e.start}–${e.end}${e.location?' · '+esc(e.location):''}${e.reminder&&e.reminder!=='none'?' · 🔔 '+timeLabel(e.reminder):''}</small></span><b>›</b></button>`; }

  function renderEventDetail(e) {
    return `<div class="detailHeader"><div><p class="eyebrow">Evento</p><h2 id="event-detail-title">${esc(e.title)}</h2></div><button class="iconBtn closeModal" type="button" aria-label="Cerrar">×</button></div>
      <div class="detailMeta"><span>${esc(fmtLongDate(e.date))}</span><span>${esc(e.start)}–${esc(e.end)}</span>${e.location?`<span>📍 ${esc(e.location)}</span>`:''}${e.reminder&&e.reminder!=='none'?`<span>🔔 ${esc(timeLabel(e.reminder))}</span>`:''}</div>
      <div class="detailActions"><button class="btn primary" data-action="edit-event" data-id="${e.id}" type="button">Editar</button><button class="btn danger" data-action="delete-event" data-id="${e.id}" type="button">Eliminar</button></div>`;
  }

  function openEventDetail(id) {
    const e = state.events.find(x=>x.id===id);
    if (!e) return;
    $('event-detail-content').innerHTML = renderEventDetail(e);
    openModal('event-detail-modal');
  }
  function sortTasks(a,b) {
    const pr = {alta:0,media:1,baja:2};
    if (a.done !== b.done) return a.done ? 1 : -1;
    if ((a.due||'9999') !== (b.due||'9999')) return (a.due||'9999').localeCompare(b.due||'9999');
    return pr[a.priority] - pr[b.priority];
  }
  function recommendTask() {
    return pendingTasks().sort((a,b)=>scoreTask(b)-scoreTask(a))[0];
  }
  function scoreTask(t) {
    let score = {alta:90,media:50,baja:25}[t.priority] || 40;
    if (t.due) {
      const d = daysBetween(t.due, today());
      if (d < 0) score += 80;
      else if (d === 0) score += 55;
      else if (d <= 2) score += 25;
    }
    score -= Math.max(0, Number(t.estimate||0) - 60) * .25;
    if (t.status === 'doing') score += 12;
    return score;
  }

  function renderTasks() {
    const filter = state.taskFilter || 'all';
    let list = visibleTasks().filter(t => state.projectFilter === 'all' || t.project === state.projectFilter);
    if (filter === 'pending') list = list.filter(t=>!t.done);
    if (filter === 'today') list = list.filter(t=>t.due===today());
    if (filter === 'overdue') list = list.filter(isOverdue);
    if (filter === 'done') list = list.filter(t=>t.done);
    if (filter === 'private') list = list.filter(t=>t.private);
    list = list.sort(sortTasks);
    if (!state.tasks.length) {
      return `${renderEmptyClean('✅','No tienes tareas','Crea una tarea simple. Los detalles aparecerán solo cuando los necesites.','new-task','Nueva tarea')}${renderAddStrip('También puedes')}`;
    }
    const overdueCount = visibleTasks().filter(isOverdue).length;
    return `<section class="pageIntro"><h2>Tareas</h2><p>Toca una tarea para ver detalles o editarla.</p></section>
      <div class="chipRow minimalFilters">
        <button class="chip ${filter==='all'?'on':''}" data-filter="all">Todas</button>
        <button class="chip ${filter==='pending'?'on':''}" data-filter="pending">Pendientes</button>
        <button class="chip ${filter==='today'?'on':''}" data-filter="today">Hoy</button>
        ${overdueCount?`<button class="chip danger ${filter==='overdue'?'on':''}" data-filter="overdue">Vencidas</button>`:''}
        <button class="chip ${filter==='done'?'on':''}" data-filter="done">Completadas</button>
      </div>
      <section class="card cleanCard"><div class="between"><h3 class="sectionTitle">${filter==='all'?'Lista':filter}</h3><button class="btn primary" data-action="new-task" type="button">＋ Nueva</button></div>${list.length?`<div class="stack">${list.map(t=>renderTaskMini(t,true)).join('')}</div>`:`<div class="empty">No hay tareas con este filtro.</div>`}</section>`;
  }

  function renderCalendar() {
    const c = state.calendar, y = c.year, m = c.month;
    const upcoming = [...state.events].filter(e => e.date >= today()).sort((a,b)=>`${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
    const todayEvents = state.events.filter(e=>e.date===today()).sort((a,b)=>a.start.localeCompare(b.start));
    if (!state.events.length) {
      return `${renderEmptyClean('📅','No tienes eventos','Agrega un evento y aquí aparecerá tu agenda limpia.','new-event','Nuevo evento')}${renderAddStrip('Organizar')}`;
    }
    const grouped = upcoming.slice(0,12).reduce((acc,e)=>{(acc[e.date] ||= []).push(e); return acc;}, {});
    let cells = '';
    if (state.settings.showMonthCalendar) {
      const first = new Date(y,m,1).getDay(), days = new Date(y,m+1,0).getDate(), prevDays = new Date(y,m,0).getDate();
      cells = DOW.map(d=>`<div class="dow">${d}</div>`).join('');
      for (let i=0;i<first;i++) cells += `<button class="day other" type="button"><span class="num">${prevDays-first+i+1}</span></button>`;
      for (let d=1;d<=days;d++) {
        const ds = localDate(new Date(y,m,d));
        const evs = state.events.filter(e=>e.date===ds);
        cells += `<button class="day ${ds===today()?'today':''} ${ds===c.selected?'selected':''}" data-date="${ds}" type="button"><span class="num">${d}</span>${evs.length?`<div class="dots"><span class="dot" style="background:var(--accent)"></span></div>`:''}</button>`;
      }
    }
    const selectedEvents = state.events.filter(e=>e.date===c.selected).sort((a,b)=>a.start.localeCompare(b.start));
    return `<section class="pageIntro"><h2>Calendario</h2><p>Agenda simple primero. El mes completo queda oculto hasta que lo necesites.</p></section>
      ${todayEvents.length?`<section class="card cleanCard"><h3 class="sectionTitle">Hoy</h3>${todayEvents.map(renderEventMini).join('')}</section>`:''}
      <section class="card cleanCard"><div class="between"><h3 class="sectionTitle">Próximos eventos</h3><button class="btn primary" data-action="new-event" type="button">＋ Nuevo</button></div>${Object.keys(grouped).length?Object.entries(grouped).map(([date,evs])=>`<div class="agendaGroup"><div class="agendaDate">${fmtLongDate(date)}</div>${evs.map(renderEventMini).join('')}</div>`).join(''):`<div class="empty">No hay eventos próximos.</div>`}</section>
      <section class="card cleanCard"><div class="between"><h3 class="sectionTitle">Vista mensual</h3><button class="chip" data-action="calendar-toggle-month" type="button">${state.settings.showMonthCalendar?'Ocultar mes':'Ver mes completo'}</button></div>${state.settings.showMonthCalendar?`<div class="between monthNav"><button class="btn ghost" data-action="month-prev">‹</button><h2>${MONTHS[m]} ${y}</h2><button class="btn ghost" data-action="month-next">›</button></div><div class="calendar minimalCalendar">${cells}</div>${selectedEvents.length?`<div class="selectedDay"><h3 class="sectionTitle">${fmtLongDate(c.selected)}</h3>${selectedEvents.map(renderEventMini).join('')}</div>`:''}`:`<p class="muted small">Oculto para mantener la pantalla limpia.</p>`}</section>`;
  }

  function renderFinance() {
    const inc = incomeMonth(), exp = expenseMonth(), bal = inc - exp, bud = budgetMonth(), pct = bud ? Math.round(exp/bud*100) : 0;
    const segs = state.categories.map(c => {
      const spent = state.transactions.filter(t=>t.type==='expense'&&t.cat===c.id&&monthKey(t.date)===monthKey()).reduce((s,t)=>s+t.amount,0);
      return `<div class="financeSeg" style="flex:${Math.max(1,spent)};background:${c.color}" title="${esc(c.name)}"></div>`;
    }).join('');
    const high = [...state.transactions].filter(t=>t.type==='expense'&&monthKey(t.date)===monthKey()).sort((a,b)=>b.amount-a.amount).slice(0,5);
    return `<section class="grid four"><div class="card kpi"><span>Ingresos</span><strong>${money(inc,{private:true})}</strong></div><div class="card kpi"><span>Gastos</span><strong>${money(exp,{private:true})}</strong></div><div class="card kpi"><span>Disponible</span><strong>${money(bal,{private:true})}</strong></div><div class="card kpi"><span>Disponible/día</span><strong>${money(Math.max(0,dailyAvailable()),{private:true})}</strong></div></section>
      <section class="card" style="margin-top:var(--space)"><div class="between"><h3 class="sectionTitle">Presupuesto mensual</h3><button class="btn primary" data-action="new-finance">＋ Transacción</button></div><div class="between"><strong>${pct}% usado</strong><span class="muted">${money(exp,{private:true})} de ${money(bud,{private:true})}</span></div><div class="financeBar" style="margin:12px 0">${segs}</div>${state.categories.map(c=>renderCategoryBudget(c)).join('')}</section>
      <section class="grid two" style="margin-top:var(--space)"><div class="card"><h3 class="sectionTitle">Gastos altos</h3>${high.length?high.map(t=>`<div class="listItem"><div class="between"><span>${category(t.cat).icon} ${esc(t.desc)}</span><strong>${money(t.amount,{private:true})}</strong></div><div class="muted small">${fmtDate(t.date)} · ${esc(category(t.cat).name)}</div></div>`).join(''):`<div class="empty">Sin gastos este mes.</div>`}</div><div class="card"><h3 class="sectionTitle">Metas de ahorro</h3>${renderSavingsGoal('Fondo emergencia',5000,Math.max(0,bal*.35),'🛡️')}${renderSavingsGoal('Viaje',3000,900,'✈️')}${renderSavingsGoal('Equipo nuevo',1200,420,'📱')}</div></section>`;
  }
  function renderCategoryBudget(c) {
    const spent = state.transactions.filter(t=>t.type==='expense'&&t.cat===c.id&&monthKey(t.date)===monthKey()).reduce((s,t)=>s+t.amount,0);
    const pct = c.budget ? Math.round(spent/c.budget*100) : 0;
    return `<div class="listItem"><div class="between"><span>${c.icon} ${esc(c.name)}</span><strong>${money(spent,{private:true})} / ${money(c.budget,{private:true})}</strong></div><div class="bar"><div class="fill" style="background:${c.color};width:${clamp(pct,0,100)}%"></div></div></div>`;
  }
  function renderSavingsGoal(name, goal, saved, icon) { const pct=Math.round(saved/goal*100); return `<div class="listItem"><div class="between"><span>${icon} ${esc(name)}</span><strong>${pct}%</strong></div><div class="muted small">${money(saved,{private:true})} de ${money(goal,{private:true})}</div><div class="bar"><div class="fill" style="width:${clamp(pct,0,100)}%"></div></div></div>`; }

  function renderHabits() {
    return `<section class="grid two"><div class="card"><div class="between"><h3 class="sectionTitle">Hábitos de hoy</h3><button class="btn primary" data-action="new-habit">＋ Hábito</button></div>${state.habits.map(renderHabitCard).join('')}</div><div class="card"><h3 class="sectionTitle">Ánimo semanal</h3><div class="row wrap">${Array.from({length:7},(_,i)=>{const d=addDays(i-6);const m=state.moods[d];return `<div class="card" style="padding:10px;text-align:center;min-width:62px"><div class="small faint">${DOW[parseLocal(d).getDay()]}</div><div style="font-size:24px">${['😢','😕','😐','🙂','😄'][m]||'—'}</div></div>`}).join('')}</div><p class="muted small">Insight: ${moodInsight()}</p></div></section>
      <section class="card" style="margin-top:var(--space)"><h3 class="sectionTitle">Heatmap de hábitos</h3>${state.habits.map(h=>`<div style="margin-bottom:14px"><div class="between"><strong>${h.icon} ${esc(h.name)}</strong><span class="muted small">racha ${habitStreak(h)} días</span></div><div class="habitHeat">${Array.from({length:28},(_,i)=>{const d=addDays(i-27);const on=Number(h.log[d]||0)>=h.goal;return `<button class="habitDay ${on?'on':''}" style="${on?`background:${h.color}`:''}" data-action="toggle-habit-date" data-id="${h.id}" data-date="${d}" title="${d}"></button>`}).join('')}</div></div>`).join('')}</section>`;
  }
  function renderHabitCard(h) { const val=Number(h.log[today()]||0), pct=Math.round(val/h.goal*100); return `<div class="listItem"><div class="between"><div><strong>${h.icon} ${esc(h.name)}</strong><div class="muted small">${val}/${h.goal} ${esc(h.unit)} · racha ${habitStreak(h)}${h.reminder?' · 🔔 '+timeLabel(h.reminder):''}</div></div><div class="row"><button class="btn ghost" data-action="habit-dec" data-id="${h.id}">−</button><button class="btn primary" data-action="habit-inc" data-id="${h.id}">＋</button><button class="btn ghost" data-action="edit-habit" data-id="${h.id}">✎</button></div></div><div class="bar" style="margin-top:8px"><div class="fill" style="background:${h.color};width:${clamp(pct,0,100)}%"></div></div></div>`; }
  function habitStreak(h) { let s=0; for(let i=0;i<90;i++){const d=addDays(-i); if(Number(h.log[d]||0)>=h.goal) s++; else break;} return s; }
  function moodInsight() {
    const entries = Object.entries(state.moods); if (entries.length < 2) return 'Registra tu ánimo algunos días para ver patrones.';
    const good = entries.filter(([,m])=>m>=3).length; return good >= entries.length/2 ? 'Tus últimos registros muestran buena energía.' : 'Tus últimos registros muestran energía variable; conviene planear tareas ligeras.';
  }

  function renderNotes() {
    if (!state.notes?.length) return `${renderEmptyClean('📝','No tienes notas','Guarda ideas rápidas y conviértelas en tareas cuando quieras.','new-note','Nueva nota')}${renderCaptureBox('Capturar nota o idea')}`;
    const list = [...state.notes].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
    return `<section class="pageIntro"><h2>Notas</h2><p>Ideas rápidas. Puedes convertir cualquier nota en tarea.</p></section>
      ${renderCaptureBox('Capturar idea')}
      <section class="card cleanCard"><div class="between"><h3 class="sectionTitle">Notas guardadas</h3><button class="btn primary" data-action="new-note" type="button">＋ Nota</button></div>
      <div class="stack">${list.map(n=>`<article class="noteItem"><button class="noteMain" data-action="edit-note" data-id="${n.id}" type="button"><strong>${esc(n.title)}</strong><span>${esc(n.body||'Sin contenido')}</span></button><div class="row"><button class="chip" data-action="note-to-task" data-id="${n.id}" type="button">Convertir</button><button class="chip danger" data-action="delete-note" data-id="${n.id}" type="button">Eliminar</button></div></article>`).join('')}</div></section>`;
  }

  function renderKanban() {
    const cols = [{id:'todo',name:'Por hacer',icon:'📋'},{id:'doing',name:'En progreso',icon:'⚡'},{id:'done',name:'Completado',icon:'✅'}];
    return `<div class="kanban">${cols.map(c=>`<section class="kanCol"><h3>${c.icon} ${c.name}</h3>${visibleTasks().filter(t=>t.status===c.id).sort(sortTasks).map(t=>`<div class="kanCard"><strong>${esc(t.title)}</strong><div class="taskMeta"><span class="tag ${t.priority==='alta'?'danger':t.priority==='media'?'warn':'ok'}">${t.priority}</span>${t.due?`<span class="tag">${fmtDate(t.due)}</span>`:''}</div><div class="row wrap" style="margin-top:8px">${cols.filter(x=>x.id!==c.id).map(x=>`<button class="chip" data-action="move-kanban" data-id="${t.id}" data-status="${x.id}">${x.icon}</button>`).join('')}</div></div>`).join('')||'<div class="empty">Sin tareas</div>'}</section>`).join('')}</div>`;
  }

  function renderAssistant() {
    const suggestions = ['plan del día','qué hago primero','qué puedo hacer en 15 minutos','mueve vencidas a mañana','gastos altos','qué hábito estoy fallando','crear tarea mañana llamar al médico'];
    return `<section class="card"><h3 class="sectionTitle">Comandos rápidos</h3><div class="chipRow">${suggestions.map(s=>`<button class="chip" data-action="send-suggestion" data-text="${esc(s)}">${esc(s)}</button>`).join('')}</div><div class="chatLog" id="chat-log">${state.chat.map(renderMessage).join('')}</div><form class="quickInput" id="assistant-form"><input class="input" id="assistant-input" placeholder="Escribe un comando o pregunta..." autocomplete="off"><button class="btn primary" type="submit">Enviar</button></form></section>`;
  }
  function renderMessage(m) { return `<div class="msg ${m.role==='user'?'user':'ai'}">${esc(m.text)}${m.actions?.length?`<div class="assistantActions">${m.actions.map(a=>`<button data-action="${esc(a.action)}" data-payload="${esc(a.payload||'')}">${esc(a.label)}</button>`).join('')}</div>`:''}</div>`; }

  function renderInsights() {
    const week = Array.from({length:7},(_,i)=>{const d=addDays(i-6); return {d,done:state.tasks.filter(t=>t.done&&t.completedAt===d).length, mood:state.moods[d]};});
    const totalDone = week.reduce((s,x)=>s+x.done,0);
    const max = Math.max(1,...week.map(x=>x.done));
    return `<section class="grid four"><div class="card kpi"><span>Completadas semana</span><strong>${totalDone}</strong></div><div class="card kpi"><span>Pomodoros</span><strong>${state.pom.sessions}</strong></div><div class="card kpi"><span>XP</span><strong>${state.xp}</strong></div><div class="card kpi"><span>Racha</span><strong>${state.streak}</strong></div></section>
      <section class="card" style="margin-top:var(--space)"><h3 class="sectionTitle">Dashboard semanal</h3><div style="display:flex;align-items:end;gap:8px;height:120px">${week.map(x=>`<div style="flex:1;text-align:center"><div class="small muted">${x.done}</div><div style="height:${Math.max(8,x.done/max*82)}px;background:${x.d===today()?'var(--accent)':'var(--panel2)'};border-radius:8px 8px 0 0"></div><div class="small faint">${DOW[parseLocal(x.d).getDay()]}</div></div>`).join('')}</div></section>
      <section class="grid two" style="margin-top:var(--space)"><div class="card"><h3 class="sectionTitle">Patrones</h3>${insightList().map(x=>`<div class="listItem"><strong>${x.icon} ${esc(x.title)}</strong><div class="muted small">${esc(x.text)}</div></div>`).join('')}</div><div class="card"><h3 class="sectionTitle">Productividad por proyecto</h3>${state.projects.map(p=>{const ts=state.tasks.filter(t=>t.project===p.id);const done=ts.filter(t=>t.done).length;const pct=ts.length?Math.round(done/ts.length*100):0;return `<div class="listItem"><div class="between"><span>${p.icon} ${esc(p.name)}</span><strong>${pct}%</strong></div><div class="bar"><div class="fill" style="background:${p.color};width:${pct}%"></div></div></div>`}).join('')}</div></section>`;
  }
  function insightList() {
    const list = [];
    const overdue = pendingTasks().filter(isOverdue).length;
    list.push({icon:'🎯',title:'Prioridad sugerida',text:recommendTask()?`Empieza por “${recommendTask().title}”.`:'No hay una tarea prioritaria ahora.'});
    list.push({icon:'⚠️',title:'Vencidas',text:overdue?`${overdue} tareas necesitan reprogramación.`:'No tienes atrasos.'});
    list.push({icon:'💰',title:'Dinero diario',text:`Puedes gastar aprox. ${money(Math.max(0,dailyAvailable()),{private:true})} por día este mes.`});
    list.push({icon:'🌱',title:'Hábito débil',text:weakHabit()?.name ? `Refuerza ${weakHabit().name}.` : 'Todos los hábitos van bien.'});
    return list;
  }
  function weakHabit() { return [...state.habits].sort((a,b)=>habitStreak(a)-habitStreak(b))[0]; }

  function renderSettings() {
    return `<section class="grid two"><div class="card"><h3 class="sectionTitle">Apariencia</h3><div class="field"><label>Nombre</label><input class="input" id="set-user" value="${esc(state.settings.userName)}"></div><div class="field"><label>Asistente</label><input class="input" id="set-assistant" value="${esc(state.settings.assistantName)}"></div><div class="grid two"><div class="field"><label>Color</label><input class="input color" id="set-accent" type="color" value="${esc(state.settings.accent)}"></div><div class="field"><label>Moneda</label><select class="input" id="set-currency">${Object.keys(CURRENCY).map(c=>`<option ${state.settings.currency===c?'selected':''}>${c}</option>`).join('')}</select></div></div><div class="grid two"><div class="field"><label>Tema</label><select class="input" id="set-theme"><option value="auto">Automático</option><option value="dark">Oscuro</option><option value="light">Claro</option><option value="neon">Neón</option><option value="exec">Ejecutivo</option></select></div><div class="field"><label>Tamaño</label><select class="input" id="set-density"><option value="comfortable">Cómodo</option><option value="compact">Compacto</option><option value="large">Grande</option></select></div></div><div class="grid two"><div class="field"><label>Modo</label><select class="input" id="set-mode"><option value="simple">Simple</option><option value="advanced">Avanzado</option></select></div><div class="field"><label>Perfil</label><select class="input" id="set-profile"><option>Personal</option><option>Trabajo</option><option>Escuela</option><option>Negocio</option></select></div></div><label class="checkRow"><input id="set-pin" type="checkbox" ${state.settings.pinEnabled?'checked':''}> PIN visual 1234</label><button class="btn ghost full" data-action="request-notifications" type="button">🔔 Activar notificaciones del dispositivo</button><p class="muted small">Las alarmas usan una hora específica. Siempre aparecen dentro de la app; las notificaciones del iPhone dependen del permiso del navegador y funcionan mejor si la app está instalada.</p><button class="btn primary full" data-action="save-settings">Guardar cambios</button></div>
      <div class="card"><h3 class="sectionTitle">Backup e instalación</h3><div class="stack"><button class="btn primary" data-action="export-backup">Exportar backup JSON</button><label class="btn ghost" for="import-file" style="text-align:center">Importar backup JSON</label><input id="import-file" type="file" accept="application/json" class="hidden"><button class="btn ghost" data-action="install-help">Cómo instalar en iPhone</button><button class="btn danger" data-action="reset-app">Reiniciar app</button></div><div class="helpBox" style="margin-top:12px">Para instalar: sube esta carpeta a GitHub Pages, Netlify o Vercel. Abre la URL en Safari y toca Compartir → Agregar a pantalla de inicio.</div></div></section>
      <section class="card" style="margin-top:var(--space)"><h3 class="sectionTitle">Modo simple vs avanzado</h3><p class="muted">Simple muestra lo esencial. Avanzado activa finanzas, hábitos, Kanban e insights semanales.</p><div class="row wrap"><button class="btn ghost" data-action="set-simple">Modo simple</button><button class="btn ghost" data-action="set-advanced">Modo avanzado</button></div></section>`;
  }

  function attachViewEvents(view) {
    if (view === 'assistant') { setTimeout(()=>{const log=$('chat-log'); if(log) log.scrollTop=log.scrollHeight;},0); }
    if (view === 'settings') {
      $('set-theme').value = state.settings.theme; $('set-density').value = state.settings.density; $('set-mode').value = state.settings.mode; $('set-profile').value = state.settings.profile;
      $('import-file')?.addEventListener('change', importBackup);
    }
  }

  function openModal(id) { updateViewportVars(); $(id)?.classList.add('show'); document.body.classList.add('modalOpen'); setTimeout(updateViewportVars, 30); }
  function closeModals() { qsa('.modalBack').forEach(m=>m.classList.remove('show')); document.body.classList.remove('modalOpen'); }
  function openQuick() {
    $('quick-actions').innerHTML = [
      ['⚡','Captura rápida','Escribe una frase','open-capture'],['✅','Tarea','Algo por hacer','new-task'],['📅','Evento','Agenda una hora','new-event'],['🌱','Hábito','Crea una rutina','new-habit'],['💸','Gasto','Registra dinero','new-finance'],['📝','Nota','Idea rápida','new-note'],['🧭','Planear mi día','Energía y tiempo','open-planner'],['📋','Plantillas','Rutinas listas','open-templates'],['📤','Compartir hoy','Copiar o enviar','share-day'],['⌕','Buscar','Encuentra algo','open-search']
    ].map(([icon,title,sub,action])=>`<button class="actionTile" data-action="${action}"><span>${icon}</span><strong>${title}</strong><small class="muted">${sub}</small></button>`).join('');
    openModal('quick-modal');
  }

  function openCapture() {
    $('capture-text').value = '';
    openModal('capture-modal');
    setTimeout(()=>$('capture-text')?.focus(),100);
  }
  function submitCaptureModal(e) {
    e.preventDefault();
    const text = $('capture-text').value.trim();
    if (!text) return;
    smartCapture(text);
    $('capture-text').value = '';
    closeModals();
  }
  function smartCapture(text) {
    const low = text.toLowerCase().trim();
    if (/^(nota|idea)/.test(low)) {
      const title = text.replace(/^(nota|idea)[:\s-]*/i,'').trim() || 'Nota rápida';
      state.notes ||= [];
      state.notes.unshift({id:uid('note'),title,body:'',createdAt:today()});
      sync(); toast('📝 Nota guardada'); return;
    }
    if (low.includes('hábito') || low.includes('habito') || low.includes('diario') || low.includes('todos los días')) {
      const title = text.replace(/^(crea|crear|agrega|agregar)?\s*(hábito|habito)?/i,'').replace(/\b(diario|todos los días|cada día)\b/ig,'').replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g,'').replace(/\b(\d{1,2})\s*(am|pm)\b/ig,'').trim() || 'Nuevo hábito';
      state.habits.push({id:uid('habit'),name:title,icon:'✨',goal:1,unit:'vez',color:state.settings.accent,reminder:extractTimeOfDay(low)||'',log:{}});
      sync(); toast('🌱 Hábito creado'); return;
    }
    if (low.includes('gasto') || low.includes('evento') || /^\s*(crea|crear|agrega|agregar|nueva|nuevo)\s+tarea/.test(low)) {
      const r = assistantReply(text,true); sync(); toast(r.text); return;
    }
    const due = parseNaturalDate(low) || today();
    const title = text.replace(/\b(hoy|mañana|pasado mañana|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)\b/ig,'').replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g,'').replace(/\b(\d{1,2})\s*(am|pm)\b/ig,'').trim() || 'Nueva tarea';
    state.tasks.push({id:uid('task'),title,note:'Creada desde captura rápida',priority:low.includes('urgente')?'alta':'media',project:'personal',due,estimate:extractMinutes(low)||25,reminder:extractTimeOfDay(low)||'',repeat:'never',status:'todo',private:false,done:false,createdAt:today(),completedAt:null,xpAwarded:false,subtasks:[]});
    sync(); toast('✅ Tarea creada');
  }

  function openPlanner() {
    $('planner-energy').value = state.settings.plannerEnergy || 'normal';
    $('planner-minutes').value = String(state.settings.plannerMinutes || 60);
    $('planner-result').innerHTML = '';
    openModal('planner-modal');
  }
  function submitPlannerForm(e) {
    e.preventDefault();
    const energy = $('planner-energy').value;
    const minutes = Number($('planner-minutes').value) || 60;
    state.settings.plannerEnergy = energy;
    state.settings.plannerMinutes = minutes;
    const plan = generateSmartPlan(energy, minutes);
    $('planner-result').innerHTML = plan.length ? `<div class="planList">${plan.map((x,i)=>`<div class="planStep"><b>${i+1}</b><span><strong>${esc(x.title)}</strong><small>${esc(x.meta)}</small></span></div>`).join('')}</div>` : '<div class="empty">No hay tareas para planear. Agrega una tarea primero.</div>';
    save();
  }
  function generateSmartPlan(energy='normal', minutes=60) {
    let list = pendingTasks().sort(sortTasks);
    if (energy === 'low') list = list.filter(t=>(t.estimate||25)<=30 || t.priority!=='alta');
    if (energy === 'high') list = list.sort((a,b)=>scoreTask(b)-scoreTask(a));
    let used = 0;
    const out = [];
    list.forEach(t=>{
      const est = Number(t.estimate||25);
      if (used + est <= minutes && out.length < 6) { used += est; out.push({title:t.title, meta:`${fmtDate(t.due)} · ${t.priority} · ${est} min`}); }
    });
    state.events.filter(e=>e.date===today()).slice(0,3).forEach(e=>out.push({title:e.title, meta:`Evento hoy · ${e.start}`}));
    return out.slice(0,7);
  }

  function extractTimeOfDay(text) {
    const s = String(text).toLowerCase();
    let m = s.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (m) return `${String(Number(m[1])).padStart(2,'0')}:${m[2]}`;
    m = s.match(/\b(1[0-2]|0?[1-9])\s*(am|pm)\b/);
    if (m) { let h=Number(m[1]); if(m[2]==='pm'&&h<12)h+=12; if(m[2]==='am'&&h===12)h=0; return `${String(h).padStart(2,'0')}:00`; }
    return '';
  }

  function shareText() {
    const tasks = pendingTasks().filter(t=>t.due===today()).sort(sortTasks).map(t=>`• ${t.title}`).join('\n') || 'Sin tareas para hoy';
    const events = state.events.filter(e=>e.date===today()).sort((a,b)=>a.start.localeCompare(b.start)).map(e=>`• ${e.start} ${e.title}`).join('\n') || 'Sin eventos';
    return `Mi plan de hoy\n\nTareas:\n${tasks}\n\nAgenda:\n${events}`;
  }
  async function shareDay() {
    const text = shareText();
    try { if (navigator.share) await navigator.share({title:'Mi plan de hoy', text}); else { await navigator.clipboard.writeText(text); toast('Plan copiado'); } }
    catch { try { await navigator.clipboard.writeText(text); toast('Plan copiado'); } catch { alert(text); } }
  }

  function openNoteForm(id=null) {
    const n = id ? state.notes?.find(x=>x.id===id) : null;
    $('note-title-modal').textContent = n ? 'Editar nota' : 'Nueva nota';
    $('note-id').value = n?.id || '';
    $('note-title').value = n?.title || '';
    $('note-body').value = n?.body || '';
    $('delete-note').style.visibility = n ? 'visible' : 'hidden';
    openModal('note-modal'); setTimeout(()=>$('note-title')?.focus(),100);
  }
  function saveNoteForm(e) {
    e.preventDefault();
    state.notes ||= [];
    const id = $('note-id').value;
    const old = state.notes.find(n=>n.id===id);
    const data = {title:$('note-title').value.trim(), body:$('note-body').value.trim(), updatedAt:today()};
    if (!data.title) return;
    if (old) Object.assign(old, data); else state.notes.unshift({id:uid('note'), createdAt:today(), ...data});
    closeModals(); sync(); toast('Nota guardada');
  }
  function noteToTask(id) {
    const n = state.notes?.find(x=>x.id===id);
    if (!n) return;
    state.tasks.push({id:uid('task'),title:n.title,note:n.body||'Convertida desde nota',priority:'media',project:'personal',due:today(),estimate:25,reminder:'',repeat:'never',status:'todo',private:false,done:false,createdAt:today(),completedAt:null,xpAwarded:false,subtasks:[]});
    sync(); toast('Nota convertida en tarea');
  }

  function openTaskForm(id=null) {
    const t = id ? state.tasks.find(x=>x.id===id) : null;
    $('task-title-modal').textContent = t ? 'Editar tarea' : 'Nueva tarea';
    $('task-id').value = t?.id || '';
    $('task-title').value = t?.title || '';
    $('task-note').value = t?.note || '';
    $('task-priority').value = t?.priority || 'media';
    $('task-project').innerHTML = state.projects.map(p=>`<option value="${p.id}">${p.icon} ${esc(p.name)}</option>`).join('');
    $('task-project').value = t?.project || state.projects[0].id;
    $('task-due').value = t?.due || today();
    $('task-estimate').value = t?.estimate || '';
    $('task-reminder').value = t?.reminder || '';
    $('task-repeat').value = t?.repeat || 'never';
    $('task-subtasks').value = (t?.subtasks || []).map(s=>s.text).join('\n');
    $('task-private').checked = !!t?.private;
    $('delete-task').style.visibility = t ? 'visible' : 'hidden';
    openModal('task-modal'); setTimeout(()=>$('task-title').focus(),100);
  }
  function saveTaskForm(e) {
    e.preventDefault();
    const id = $('task-id').value;
    const old = state.tasks.find(t=>t.id===id);
    const subtasks = $('task-subtasks').value.split('\n').map(x=>x.trim()).filter(Boolean).map((text,i)=>({id:old?.subtasks?.[i]?.id || uid('sub'), text, done:old?.subtasks?.[i]?.done || false}));
    const data = {title:$('task-title').value.trim(),note:$('task-note').value.trim(),priority:$('task-priority').value,project:$('task-project').value,due:$('task-due').value,estimate:Number($('task-estimate').value)||0,reminder:normalizeTime($('task-reminder').value),repeat:$('task-repeat').value,private:$('task-private').checked,subtasks};
    if (!data.title) return;
    if (old) Object.assign(old, data);
    else state.tasks.push({id:uid('task'),status:'todo',done:false,createdAt:today(),completedAt:null,xpAwarded:false,...data});
    closeModals(); sync(); toast(old?'Tarea actualizada':'Tarea creada');
  }

  function openEventForm(id=null, date=null) {
    const e = id ? state.events.find(x=>x.id===id) : null;
    $('event-title-modal').textContent = e ? 'Editar evento' : 'Nuevo evento';
    $('event-id').value = e?.id || ''; $('event-title').value = e?.title || ''; $('event-location').value = e?.location || '';
    $('event-date').value = e?.date || date || state.calendar.selected || today(); $('event-color').value = e?.color || '#38bdf8'; $('event-start').value = e?.start || '09:00'; $('event-end').value = e?.end || '10:00'; $('event-reminder').value = normalizeTime(e?.reminder || '');
    $('delete-event').style.visibility = e ? 'visible' : 'hidden'; openModal('event-modal');
  }
  function saveEventForm(e) { e.preventDefault(); const id=$('event-id').value; const old=state.events.find(x=>x.id===id); const data={title:$('event-title').value.trim(),location:$('event-location').value.trim(),date:$('event-date').value,start:$('event-start').value,end:$('event-end').value,color:$('event-color').value,reminder:normalizeTime($('event-reminder').value)}; if(!data.title)return; if(old)Object.assign(old,data); else state.events.push({id:uid('event'),...data}); closeModals(); sync(); toast('Evento guardado'); }

  function openFinanceForm(id=null) {
    const f = id ? state.transactions.find(x=>x.id===id) : null;
    $('finance-title-modal').textContent = f ? 'Editar transacción' : 'Nueva transacción'; $('finance-id').value=f?.id||''; $('finance-desc').value=f?.desc||''; $('finance-amount').value=f?.amount||''; $('finance-type').value=f?.type||'expense'; $('finance-cat').innerHTML=state.categories.map(c=>`<option value="${c.id}">${c.icon} ${esc(c.name)}</option>`).join(''); $('finance-cat').value=f?.cat||state.categories[0].id; $('finance-date').value=f?.date||today(); $('delete-finance').style.visibility=f?'visible':'hidden'; openModal('finance-modal');
  }
  function saveFinanceForm(e) { e.preventDefault(); const id=$('finance-id').value; const old=state.transactions.find(x=>x.id===id); const data={desc:$('finance-desc').value.trim(),amount:Number($('finance-amount').value)||0,type:$('finance-type').value,cat:$('finance-cat').value,date:$('finance-date').value}; if(!data.desc||!data.amount)return; if(old)Object.assign(old,data); else state.transactions.push({id:uid('fin'),...data}); closeModals(); sync(); toast('Transacción guardada'); }

  function openHabitForm(id=null) {
    const h = id ? state.habits.find(x=>x.id===id) : null;
    $('habit-id').value=h?.id||''; $('habit-name').value=h?.name||''; $('habit-icon').value=h?.icon||'✨'; $('habit-goal').value=h?.goal||1; $('habit-unit').value=h?.unit||'vez'; $('habit-color').value=h?.color||'#00d68f'; $('habit-reminder').value=h?.reminder||''; $('delete-habit').style.visibility=h?'visible':'hidden'; openModal('habit-modal');
  }
  function saveHabitForm(e) { e.preventDefault(); const id=$('habit-id').value; const old=state.habits.find(x=>x.id===id); const data={name:$('habit-name').value.trim(),icon:$('habit-icon').value.trim()||'✨',goal:Number($('habit-goal').value)||1,unit:$('habit-unit').value.trim()||'vez',color:$('habit-color').value,reminder:normalizeTime($('habit-reminder').value)}; if(!data.name)return; if(old)Object.assign(old,data); else state.habits.push({id:uid('habit'),log:{},...data}); closeModals(); sync(); toast('Hábito guardado'); }

  function completeTask(id) {
    const t = state.tasks.find(x=>x.id===id); if(!t) return;
    t.done = !t.done; t.status = t.done ? 'done' : 'todo'; t.completedAt = t.done ? today() : null;
    if (t.done && !t.xpAwarded) { state.xp += 10; t.xpAwarded = true; toast('✅ Completada · +10 XP'); }
    else toast(t.done?'Tarea completada':'Tarea reabierta');
    sync();
  }
  function deleteItem(type, id) {
    const map = {task:'tasks',event:'events',finance:'transactions',habit:'habits',note:'notes'}; const arr = state[map[type]]; const i = arr.findIndex(x=>x.id===id); if(i<0)return;
    if (!confirm('¿Eliminar este elemento?')) return;
    state.undo = {type, item:arr[i], at:Date.now()}; arr.splice(i,1); closeModals(); sync(); toast('Eliminado. Puedes deshacer desde notificaciones.');
  }
  function undoDelete() {
    if(!state.undo) return toast('Nada que deshacer');
    const map={task:'tasks',event:'events',finance:'transactions',habit:'habits',note:'notes'}; state[map[state.undo.type]].push(state.undo.item); state.undo=null; sync(); toast('Deshecho');
  }
  function postponeTask(id, days=1) { const t=state.tasks.find(x=>x.id===id); if(!t)return; t.due=addDays(Number(days)||1); sync(); toast(`Reprogramada para ${fmtDate(t.due)}`); }
  function moveOverdue() { let n=0; state.tasks.forEach(t=>{if(isOverdue(t)){t.due=addDays(1); n++;}}); sync(); toast(n?`${n} tareas movidas a mañana`:'No hay vencidas'); }
  function toggleSubtask(taskId, subId) { const t=state.tasks.find(x=>x.id===taskId); const s=t?.subtasks?.find(x=>x.id===subId); if(s){s.done=!s.done; sync();} }
  function moveKanban(id,status) { const t=state.tasks.find(x=>x.id===id); if(t){t.status=status; t.done=status==='done'; if(t.done&&!t.completedAt)t.completedAt=today(); sync();} }

  function assistantReply(input, apply=true) {
    const msg = input.trim(); const low = msg.toLowerCase();
    const date = parseNaturalDate(low) || today();
    if (/^(crea|crear|nueva|agrega|agregar) tarea/.test(low)) {
      const title = msg.replace(/^(crea|crear|nueva|agrega|agregar) tarea/i,'').replace(/\b(hoy|mañana|pasado mañana|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)\b/ig,'').trim() || 'Nueva tarea';
      if (apply) state.tasks.push({id:uid('task'),title,note:'Creada desde asistente',priority:low.includes('urgente')?'alta':'media',project:'personal',due:date,estimate:extractMinutes(low)||25,reminder:extractTimeOfDay(low)||'',repeat:'never',status:'todo',private:false,done:false,createdAt:today(),completedAt:null,xpAwarded:false,subtasks:[]});
      return {text:`Listo. Creé la tarea “${title}” para ${fmtDate(date)}.`,actions:[{label:'Ver tareas',action:'view-tasks'},{label:'Plan del día',action:'assistant:plan'}]};
    }
    if (/^(crea|crear|nuevo|agrega|agregar) evento/.test(low)) {
      const time = extractTimeOfDay(low) || '09:00';
      const title = msg.replace(/^(crea|crear|nuevo|agrega|agregar) evento/i,'').replace(/\b(hoy|mañana|pasado mañana|lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)\b/ig,'').replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g,'').trim() || 'Evento';
      if (apply) state.events.push({id:uid('event'),title,location:'',date,start:time,end:addMinutes(time,60),color:state.settings.accent,reminder:time});
      return {text:`Evento “${title}” creado para ${fmtDate(date)} a las ${time}.`,actions:[{label:'Calendario',action:'view-calendar'}]};
    }
    if (/^(registrar|registra|agregar|agrega) gasto/.test(low) || low.includes('gasto ')) {
      const amt = Number((low.match(/\d+(?:[.,]\d+)?/)||[])[0]?.replace(',','.')) || 0;
      const cat = state.categories.find(c=>low.includes(c.name.toLowerCase())||low.includes(c.id)) || state.categories[0];
      const desc = msg.replace(/^(registrar|registra|agregar|agrega) gasto/i,'').replace(/\d+(?:[.,]\d+)?/,'').trim() || cat.name;
      if (apply && amt) state.transactions.push({id:uid('fin'),desc,amount:amt,type:'expense',cat:cat.id,date:today()});
      return {text: amt ? `Registré el gasto “${desc}” por ${money(amt)} en ${cat.name}.` : 'Dime el monto del gasto, por ejemplo: registrar gasto 20 comida.',actions:[{label:'Ver dinero',action:'view-finance'}]};
    }
    if (low.includes('qué hago primero') || low.includes('que hago primero') || low.includes('prioridad')) {
      const t = recommendTask(); return t ? {text:`Te sugiero empezar por “${t.title}”. Motivo: prioridad ${t.priority}${t.due?`, vence ${fmtDate(t.due)}`:''} y toma aprox. ${t.estimate||25} min.`,actions:[{label:'Enfocarme',action:'focus',payload:t.id},{label:'Ver tareas',action:'view-tasks'}]} : {text:'No tienes tareas pendientes. Buen momento para planear algo nuevo.'};
    }
    if (low.includes('compartir')) return {text: shareText(),actions:[{label:'Compartir hoy',action:'share-day'}]};
    if (low.includes('plan')) return {text: planSummary(),actions:[{label:'Ir a Hoy',action:'view-today'},{label:'Mover vencidas',action:'move-overdue'}]};
    if (low.includes('vencidas') && (low.includes('mañana') || low.includes('mueve'))) { if (apply) moveOverdue(); return {text:'Moví las tareas vencidas a mañana.'}; }
    if (low.includes('puedo hacer') || low.includes('tengo')) { const min = extractMinutes(low)||15; const found=pendingTasks().filter(t=>(t.estimate||25)<=min).sort(sortTasks).slice(0,5); return {text: found.length?`En ${min} minutos puedes hacer:\n${found.map(t=>'• '+t.title).join('\n')}`:`No encontré tareas de ${min} minutos o menos.`,actions:[{label:'Ver tareas',action:'view-tasks'}]}; }
    if (low.includes('gastos altos')) { const high=[...state.transactions].filter(t=>t.type==='expense').sort((a,b)=>b.amount-a.amount).slice(0,5); return {text:high.length?`Tus gastos más altos:\n${high.map(t=>`• ${t.desc}: ${money(t.amount)} (${category(t.cat).name})`).join('\n')}`:'No hay gastos registrados.',actions:[{label:'Ver dinero',action:'view-finance'}]}; }
    if (low.includes('hábito') || low.includes('habito')) { const h=weakHabit(); return {text:h?`El hábito que más conviene reforzar es “${h.name}”. Su racha actual es ${habitStreak(h)} días.`:'No hay hábitos registrados.',actions:[{label:'Ver hábitos',action:'view-habits'}]}; }
    if (low.includes('limpieza')) { const old=state.tasks.filter(t=>t.done && t.completedAt && daysBetween(today(),t.completedAt)>30).length; return {text:`Encontré ${old} tareas completadas antiguas. Puedes exportar backup antes de limpiar.`,actions:[{label:'Exportar backup',action:'export-backup'}]}; }
    return {text:`Entendido: “${msg}”. Puedo ayudarte con tareas, calendario, finanzas, hábitos, prioridades y plan del día.`,actions:[{label:'Plan del día',action:'assistant:plan'},{label:'Qué hago primero',action:'assistant:first'}]};
  }
  function parseNaturalDate(text) {
    if (text.includes('pasado mañana')) return addDays(2); if (text.includes('mañana')) return addDays(1); if (text.includes('hoy')) return today();
    const names = [['domingo',0],['lunes',1],['martes',2],['miércoles',3],['miercoles',3],['jueves',4],['viernes',5],['sábado',6],['sabado',6]];
    const hit = names.find(([n])=>text.includes(n)); if(!hit)return null; const now=new Date(); let diff=hit[1]-now.getDay(); if(diff<=0)diff+=7; return addDays(diff);
  }
  function extractMinutes(text) { const m=text.match(/(\d+)\s*(min|minutos|m)/); return m?Number(m[1]):null; }
  function addMinutes(time, mins) { const [h,m]=time.split(':').map(Number); const d=new Date(2000,0,1,h,m+mins); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
  function planSummary() { const p=generateDayPlan(); return p.length ? `Plan recomendado para hoy:\n${p.map(x=>`${x.time} — ${x.title}`).join('\n')}` : 'Hoy está libre. Puedes crear tareas o eventos.'; }
  function sendAssistant(text) { state.chat.push({role:'user',text,time:nowTime()}); const r=assistantReply(text,true); state.chat.push({role:'ai',text:r.text,time:nowTime(),actions:r.actions||[]}); save(); render(); }

  function runAction(action, el) {
    if (!action) return;
    if (action.startsWith('view-')) return setView(action.replace('view-',''));
    if (action === 'open-quick') return openQuick();
    if (action === 'open-search') return openSearch();
    if (action === 'open-capture') return openCapture();
    if (action === 'open-planner') return openPlanner();
    if (action === 'open-templates') return openModal('templates-modal');
    if (action === 'share-day') return shareDay();
    if (action === 'new-task') return openTaskForm();
    if (action === 'task-detail') return openTaskDetail(el.dataset.id);
    if (action === 'edit-task') return openTaskForm(el.dataset.id);
    if (action === 'new-event') return openEventForm(null, el.dataset.date);
    if (action === 'event-detail') return openEventDetail(el.dataset.id);
    if (action === 'edit-event') return openEventForm(el.dataset.id);
    if (action === 'delete-event') return deleteItem('event', el.dataset.id);
    if (action === 'new-finance') return openFinanceForm();
    if (action === 'new-habit') return openHabitForm();
    if (action === 'new-note') return openNoteForm();
    if (action === 'edit-note') return openNoteForm(el.dataset.id);
    if (action === 'delete-note') return deleteItem('note', el.dataset.id);
    if (action === 'note-to-task') return noteToTask(el.dataset.id);
    if (action === 'edit-habit') return openHabitForm(el.dataset.id);
    if (action === 'toggle-task') return completeTask(el.dataset.id);
    if (action === 'toggle-subtask') return toggleSubtask(el.dataset.task, el.dataset.id);
    if (action === 'delete-task') return deleteItem('task', el.dataset.id);
    if (action === 'postpone') return postponeTask(el.dataset.id, el.dataset.days || 1);
    if (action === 'move-overdue') return moveOverdue();
    if (action === 'undo-delete') return undoDelete();
    if (action === 'clear-notifs') { state.notifications=[]; sync(); return toast('Notificaciones limpias'); }
    if (action === 'start-day' || action === 'view-today') return setView('today');
    if (action === 'assistant-plan' || action === 'assistant:plan') { state.chat.push({role:'ai',text:planSummary(),time:nowTime(),actions:[{label:'Ir a Hoy',action:'view-today'}]}); save(); setView('assistant'); return; }
    if (action === 'assistant:first') { const r=assistantReply('qué hago primero',false); state.chat.push({role:'ai',text:r.text,time:nowTime(),actions:r.actions}); save(); setView('assistant'); return; }
    if (action === 'send-suggestion') return sendAssistant(el.dataset.text || '');
    if (action === 'focus' || action === 'focus-task') { const id=el.dataset.payload||el.dataset.id; const t=state.tasks.find(x=>x.id===id); return toast(t?`🎯 Enfoque: ${t.title}`:'Pomodoro listo'); }
    if (action === 'set-mood') { state.moods[today()] = Number(el.dataset.mood); sync(); return toast('Ánimo registrado'); }
    if (action === 'time-filter') { const min=Number(el.dataset.min); const found=pendingTasks().filter(t=>(t.estimate||25)<=min).sort(sortTasks).slice(0,5); const box=$('time-suggestions'); if(box) box.innerHTML=found.length?found.map(t=>renderTaskMini(t,true)).join(''):'<div class="empty">No encontré tareas para ese tiempo.</div>'; return; }
    if (action === 'routine') return createRoutine(el.dataset.name);
    if (action === 'month-prev') { state.calendar.month--; if(state.calendar.month<0){state.calendar.month=11;state.calendar.year--;} sync(); return; }
    if (action === 'month-next') { state.calendar.month++; if(state.calendar.month>11){state.calendar.month=0;state.calendar.year++;} sync(); return; }
    if (action === 'calendar-toggle-month') { state.settings.showMonthCalendar = !state.settings.showMonthCalendar; sync(); return; }
    if (action === 'habit-inc' || action === 'habit-dec') { const h=state.habits.find(x=>x.id===el.dataset.id); if(h){h.log[today()]=Math.max(0,Number(h.log[today()]||0)+(action==='habit-inc'?1:-1)); state.xp += action==='habit-inc'?2:0; sync();} return; }
    if (action === 'toggle-habit-date') { const h=state.habits.find(x=>x.id===el.dataset.id); if(h){h.log[el.dataset.date]=Number(h.log[el.dataset.date]||0)>=h.goal?0:h.goal; sync();} return; }
    if (action === 'move-kanban') return moveKanban(el.dataset.id, el.dataset.status);
    if (action === 'save-settings') return saveSettings();
    if (action === 'request-notifications') return requestNotifications();
    if (action === 'export-backup') return exportBackup();
    if (action === 'install-help') return alert('En iPhone: sube la carpeta a una URL HTTPS, abre en Safari, toca Compartir y luego “Agregar a pantalla de inicio”.');
    if (action === 'reset-app') { if(confirm('¿Borrar todos los datos locales?')){localStorage.removeItem(STORAGE); location.reload();} return; }
    if (action === 'set-simple') { state.settings.mode='simple'; sync(); return; }
    if (action === 'set-advanced') { state.settings.mode='advanced'; sync(); return; }
  }

  function createRoutine(name) {
    const map = {
      'mañana':['Tomar agua','Revisar agenda','Elegir tarea principal'],
      'trabajo':['Revisar correos importantes','Bloque de enfoque 25 min','Actualizar pendientes'],
      'noche':['Preparar mañana','Registrar ánimo','Leer 10 minutos'],
      'estudio':['Preparar material de estudio','Bloque de estudio 25 min','Repasar apuntes 10 min']
    };
    (map[name]||[]).forEach(title=>state.tasks.push({id:uid('task'),title,note:`Rutina de ${name}`,priority:'media',project:'personal',due:today(),estimate:15,reminder:'',repeat:'never',status:'todo',private:false,done:false,createdAt:today(),completedAt:null,xpAwarded:false,subtasks:[]}));
    sync(); toast(`Rutina de ${name} creada`);
  }

  function saveSettings() {
    Object.assign(state.settings, {userName:$('set-user').value.trim()||'Usuario', assistantName:$('set-assistant').value.trim()||'Jarvis', accent:$('set-accent').value, currency:$('set-currency').value, theme:$('set-theme').value, density:$('set-density').value, mode:$('set-mode').value, profile:$('set-profile').value, pinEnabled:$('set-pin').checked});
    sync(); toast('Configuración guardada');
  }
  function exportBackup() { const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`assistant-phone-backup-${today()}.json`; a.click(); URL.revokeObjectURL(a.href); }
  function importBackup(e) { const file=e.target.files?.[0]; if(!file)return; const r=new FileReader(); r.onload=()=>{try{state=mergeDeep(makeDefaults(),JSON.parse(r.result)); save(); sync(); toast('Backup importado');}catch{toast('Archivo inválido');}}; r.readAsText(file); }

  function normalizeTime(value) {
    const raw = String(value || '').trim();
    const m = raw.match(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
    return m ? raw : '';
  }
  function timeLabel(value) {
    const time = normalizeTime(value);
    return time ? time : 'Sin alarma';
  }
  function timeToMs(date, time) {
    if (!date || !time) return null;
    const parts = String(time).split(':').map(Number);
    if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
    const d = parseLocal(date);
    d.setHours(parts[0], parts[1], 0, 0);
    return d.getTime();
  }
  function canFire(target, now = Date.now()) {
    return target && now >= target && now - target < 6 * 60000;
  }
  function pushAlarm(key, icon, title, text, actions = []) {
    state.alarmLog ||= {};
    if (state.alarmLog[key]) return false;
    state.alarmLog[key] = Date.now();
    state.notifications ||= [];
    state.notifications.unshift({type:'alarm', icon, title, text, actions});
    state.notifications = state.notifications.slice(0, 20);
    save();
    toast(`${icon} ${title}: ${text}`, 5200);
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body:text, icon:'icons/icon-192.png', badge:'icons/icon-192.png' }); } catch {}
    }
    return true;
  }
  function checkAlarms() {
    const now = Date.now();
    state.alarmLog ||= {};
    state.tasks.forEach(t => {
      if (t.done || !t.due || !t.reminder) return;
      const target = timeToMs(t.due, t.reminder);
      if (canFire(target, now)) pushAlarm(`task:${t.id}:${target}`, '✅', 'Tarea', t.title, [{label:'Ver tareas',action:'view-tasks'}]);
    });
    state.events.forEach(e => {
      if (!e.date || !e.reminder) return;
      const target = timeToMs(e.date, e.reminder);
      if (canFire(target, now)) pushAlarm(`event:${e.id}:${target}`, '📅', 'Evento', `${e.title} · ${e.start || timeLabel(e.reminder)}`, [{label:'Calendario',action:'view-calendar'}]);
    });
    state.habits.forEach(h => {
      if (!h.reminder || Number(h.log?.[today()] || 0) >= Number(h.goal || 1)) return;
      const target = timeToMs(today(), h.reminder);
      if (canFire(target, now)) pushAlarm(`habit:${h.id}:${target}`, '🌱', 'Hábito', h.name, [{label:'Hábitos',action:'view-habits'}]);
    });
  }
  async function requestNotifications() {
    if (!('Notification' in window)) return toast('Este navegador no permite notificaciones del dispositivo.');
    try {
      const p = await Notification.requestPermission();
      state.settings.deviceNotifications = p === 'granted';
      save();
      toast(p === 'granted' ? '🔔 Notificaciones activadas' : 'No se activaron las notificaciones');
    } catch { toast('No pude pedir permiso de notificaciones.'); }
  }
  function updateViewportVars() {
    const vv = window.visualViewport;
    const h = Math.round(vv?.height || window.innerHeight || document.documentElement.clientHeight);
    const top = Math.round(vv?.offsetTop || 0);
    document.documentElement.style.setProperty('--vvh', `${h}px`);
    document.documentElement.style.setProperty('--vvo', `${top}px`);
    const keyboardOpen = !!vv && (window.innerHeight - vv.height - vv.offsetTop) > 120;
    document.body.classList.toggle('keyboardOpen', keyboardOpen);
  }

  function openSearch() { openModal('search-modal'); $('global-search-input').value=''; $('global-search-results').innerHTML='<div class="empty">Escribe para buscar.</div>'; setTimeout(()=>$('global-search-input').focus(),100); }
  function doSearch(q) {
    q=q.toLowerCase().trim(); const out=[]; if(!q)return '<div class="empty">Escribe para buscar.</div>';
    state.tasks.filter(t=>(t.title+t.note).toLowerCase().includes(q)).slice(0,8).forEach(t=>out.push({icon:'✅',title:t.title,sub:`Tarea · ${fmtDate(t.due)}`,view:'tasks'}));
    state.events.filter(e=>(e.title+e.location).toLowerCase().includes(q)).slice(0,8).forEach(e=>out.push({icon:'📅',title:e.title,sub:`Evento · ${fmtDate(e.date)} ${e.start}`,view:'calendar'}));
    state.transactions.filter(f=>(f.desc+category(f.cat).name).toLowerCase().includes(q)).slice(0,8).forEach(f=>out.push({icon:'💰',title:f.desc,sub:`${f.type==='expense'?'Gasto':'Ingreso'} · ${money(f.amount,{private:true})}`,view:'finance'}));
    state.habits.filter(h=>h.name.toLowerCase().includes(q)).forEach(h=>out.push({icon:h.icon,title:h.name,sub:'Hábito',view:'habits'}));
    return out.length?out.map(x=>`<button class="searchItem" data-view="${x.view}" type="button"><strong>${x.icon} ${esc(x.title)}</strong><div class="muted small">${esc(x.sub)}</div></button>`).join(''):'<div class="empty">No encontré resultados.</div>';
  }

  function initPinPad() { $('pin-pad').innerHTML = ['1','2','3','4','5','6','7','8','9','⌫','0','OK'].map(x=>`<button type="button" data-pin="${x}">${x}</button>`).join(''); }
  function updatePin() { qsa('#pin-dots span').forEach((d,i)=>d.classList.toggle('on',i<pinEntry.length)); }
  function pinPress(v) { if(v==='⌫') pinEntry=pinEntry.slice(0,-1); else if(v==='OK'){ if(pinEntry==='1234'){pinEntry=''; updatePin(); $('lock').classList.remove('show'); toast('Desbloqueado');} else {$('pin-error').textContent='PIN incorrecto'; setTimeout(()=>{$('pin-error').textContent='';pinEntry='';updatePin();},800);} } else if(pinEntry.length<4) pinEntry+=v; updatePin(); }

  function initSpeech() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    speech = new SR(); speech.lang='es-ES'; speech.continuous=false; speech.interimResults=false;
    speech.onresult = (e)=> sendAssistant(e.results[0][0].transcript);
    speech.onerror = ()=> toast('No pude escuchar. Intenta de nuevo.');
  }

  function bindGlobalEvents() {
    document.body.addEventListener('click', (e)=>{
      const viewBtn = e.target.closest('[data-view]'); if(viewBtn){closeModals(); return setView(viewBtn.dataset.view);}
      const actionBtn = e.target.closest('[data-action]'); if(actionBtn){closeModals(); return runAction(actionBtn.dataset.action, actionBtn);}
      if(e.target.classList.contains('modalBack') || e.target.classList.contains('closeModal')) closeModals();
      const dateBtn = e.target.closest('[data-date]'); if(dateBtn && dateBtn.classList.contains('day')){state.calendar.selected=dateBtn.dataset.date; sync();}
      const projectBtn = e.target.closest('[data-project]'); if(projectBtn){state.projectFilter=projectBtn.dataset.project; sync();}
      const filterBtn = e.target.closest('[data-filter]'); if(filterBtn){state.taskFilter=filterBtn.dataset.filter; sync();}
    });
    $('task-form').addEventListener('submit', saveTaskForm); $('event-form').addEventListener('submit', saveEventForm); $('finance-form').addEventListener('submit', saveFinanceForm); $('habit-form').addEventListener('submit', saveHabitForm); $('note-form').addEventListener('submit', saveNoteForm); $('capture-modal-form').addEventListener('submit', submitCaptureModal); $('planner-form').addEventListener('submit', submitPlannerForm);
    $('delete-task').addEventListener('click',()=>deleteItem('task',$('task-id').value)); $('delete-event').addEventListener('click',()=>deleteItem('event',$('event-id').value)); $('delete-finance').addEventListener('click',()=>deleteItem('finance',$('finance-id').value)); $('delete-habit').addEventListener('click',()=>deleteItem('habit',$('habit-id').value)); $('delete-note').addEventListener('click',()=>deleteItem('note',$('note-id').value));
    $('quick-btn').addEventListener('click',openQuick); $('fab').addEventListener('click',openQuick); $('search-btn').addEventListener('click',openSearch); $('voice-btn').addEventListener('click',()=>{ if(speech){toast('Escuchando...'); speech.start();} else toast('Tu navegador no soporta reconocimiento de voz.'); });
    $('lock-btn').addEventListener('click',()=> state.settings.pinEnabled ? $('lock').classList.add('show') : toast('Activa el PIN en configuración.'));
    $('quick-unlock').addEventListener('click',()=>{$('lock').classList.remove('show'); toast('Desbloqueado visualmente');});
    $('privacy-toggle').addEventListener('click',()=>{state.settings.privacyMode=!state.settings.privacyMode; sync(); toast(state.settings.privacyMode?'Modo privacidad activo':'Modo privacidad desactivado');});
    $('pin-pad').addEventListener('click',e=>{const b=e.target.closest('[data-pin]'); if(b)pinPress(b.dataset.pin);});
    $('global-search-input').addEventListener('input',e=>$('global-search-results').innerHTML=doSearch(e.target.value));
    document.addEventListener('submit',e=>{ if(e.target.id==='assistant-form'){ e.preventDefault(); const inp=$('assistant-input'); if(inp.value.trim()) sendAssistant(inp.value.trim()); } if(e.target.classList.contains('captureForm')){ e.preventDefault(); const inp=e.target.querySelector('[name="capture"]'); if(inp?.value.trim()){ smartCapture(inp.value.trim()); inp.value=''; } }});
    document.body.addEventListener('click',e=>{ const ex=e.target.closest('[data-example]'); if(ex){ const input=$('capture-text'); if(input){input.value=ex.dataset.example; input.focus();} } });
    $('onboarding-form').addEventListener('submit',e=>{e.preventDefault(); state.settings.userName=$('ob-user').value.trim()||'Usuario'; state.settings.assistantName=$('ob-assistant').value.trim()||'Jarvis'; state.settings.currency=$('ob-currency').value; state.settings.accent=$('ob-accent').value; state.settings.density=$('ob-compact').checked?'compact':'comfortable'; state.settings.pinEnabled=$('ob-pin').checked; state.settings.mode=$('ob-mode-select')?.value || qs('input[name="ob-mode"]:checked').value; state.settings.onboarded=true; $('onboarding').classList.remove('show'); sync();});
    document.addEventListener('keydown',e=>{ if(e.key==='Escape')closeModals(); if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch();} });
    window.addEventListener('online',applyTheme); window.addEventListener('offline',applyTheme);
    updateViewportVars(); window.addEventListener('resize', updateViewportVars); window.visualViewport?.addEventListener('resize', updateViewportVars); window.visualViewport?.addEventListener('scroll', updateViewportVars);
    document.addEventListener('focusin', e => { if (e.target.matches('input, textarea, select')) setTimeout(()=>e.target.scrollIntoView({block:'center', behavior:'smooth'}), 280); }, true);
  }

  function registerSW() { if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{}); }

  function init() {
    initPinPad(); bindGlobalEvents(); initSpeech(); registerSW(); applyTheme();
    if (state.settings.onboarded) $('onboarding').classList.remove('show'); else $('onboarding').classList.add('show');
    if (!state.settings.onboarded) state.view='home';
    render();
    checkAlarms(); setInterval(checkAlarms, 60000);
  }

  window.addEventListener('DOMContentLoaded', init);
})();
