/* =========================================================
   Выборы мэра Goxten — 2026
   Вся настройка — в блоке НАСТРОЙКИ ниже.
   Чтобы добавить партию, допишите объект в массив PARTIES:
   карточка и строка в бюллетене появятся автоматически.
   ========================================================= */

/* ========================= НАСТРОЙКИ ========================= */

/* Discord-вебхук, куда уходят голоса и служебные уведомления.
   ВНИМАНИЕ: на GitHub Pages эта ссылка видна всем в исходном коде страницы.
   Если вебхук начнут спамить — удалите его в настройках канала и создайте новый. */
const WEBHOOK_URL = 'https://discord.com/api/webhooks/1550500580730863718/SMdcPIK2qQVua3Q1ecjHyoIC6CO93oVJIihjFkZcZeM7HfxjyrQlVJD8add73q24pEBF';

/* Начало голосования. null — открыто сразу. Иначе ISO-дата: '2026-09-20T12:00:00+03:00' */
const VOTING_START = null;

/* Окончание голосования: 23 сентября 2026, 23:59 по Москве. */
const VOTING_DEADLINE = '2026-09-23T23:59:00+03:00';

/* ФИО председателя ЦИК. Если ввести его в бюллетень — вместо голоса
   откроется панель управления и в Discord уйдёт запрос «начинать голосование?».
   ОБЯЗАТЕЛЬНО поменяйте: на публичном репозитории это ФИО тоже видно всем. */
const ADMIN_NAMES = [
  { lastName: 'Гокстен', firstName: 'Админ', middleName: 'Цикович' }
];

/* Свой бэкенд для подсчёта, если появится. null — не использовать. */
const API_ENDPOINT = null;

/* Минимальная длина игрового паспорта. */
const PASSPORT_MIN = 5;

/* Ключи локального хранилища. Меняйте при новых выборах, чтобы сбросить блокировки. */
const STORAGE_VOTE = 'goxten-election-2026:vote';
const STORAGE_USED = 'goxten-election-2026:used-passports';
const STORAGE_STARTED = 'goxten-election-2026:started';

/* Партии. Порядок = номера в бюллетене.
   name      — полное название
   short     — аббревиатура (можно null)
   tag       — пометка под названием
   program   — пункты программы
   note      — дополнительная отметка (можно null)
   color     — цвет партии для светлой темы (он же цвет полосы в Discord)
   colorDark — цвет партии для тёмной темы                          */
const PARTIES = [
  {
    id: 'egu',
    name: 'European–Göxten Union',
    short: 'EGU',
    tag: 'Демократия и Оппозиция',
    program: [
      'Экология и охрана природы Goxten',
      'Соблюдение законов Goxten',
      'Сотрудничество с компаниями стран Евросоюза (в игровом мире)',
      'Нейтралитет во внешней политике',
      'Свобода слова'
    ],
    note: null,
    color: '#1D4E8F',
    colorDark: '#7CADE8'
  },
  {
    id: 'raffe',
    name: 'Raffe',
    short: null,
    tag: 'Оппозиция',
    program: [
      'Прекращение войны',
      'Свобода слова'
    ],
    note: 'Действует с 26 года',
    color: '#9B2C2C',
    colorDark: '#E4877F'
  }
];

/* ======================= КОНЕЦ НАСТРОЕК ====================== */


/* ------------------------- утилиты ------------------------- */

const $ = (sel) => document.querySelector(sel);

const store = {
  get(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) { return false; }
  }
};

/* Короткий необратимый отпечаток паспорта — сам номер в браузере не хранится. */
function fingerprint(text) {
  let h = 5381;
  const s = text.toUpperCase();
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  let g = 52711;
  for (let i = s.length - 1; i >= 0; i--) {
    g = ((g << 5) + g ^ s.charCodeAt(i)) >>> 0;
  }
  return (h.toString(36) + g.toString(36)).toUpperCase();
}

function receiptId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return 'GX-' + out.slice(0, 4) + '-' + out.slice(4);
}

function partyById(id) {
  return PARTIES.find((p) => p.id === id) || null;
}

function formatDateTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

function normalize(text) {
  return (text || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

function isAdmin(data) {
  return ADMIN_NAMES.some((a) =>
    normalize(a.lastName) === normalize(data.lastName) &&
    normalize(a.firstName) === normalize(data.firstName) &&
    normalize(a.middleName) === normalize(data.middleName)
  );
}

function hexToInt(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  return m ? parseInt(m[1], 16) : 0x9AA3AE;
}


/* ------------------------- Discord ------------------------- */

/* Отправка через multipart/form-data: браузер не делает preflight-запрос,
   поэтому вебхук принимает сообщение прямо со статичной страницы. */
async function sendToWebhook(payload) {
  if (!WEBHOOK_URL) return false;

  const form = new FormData();
  form.append('payload_json', JSON.stringify(payload));

  try {
    const res = await fetch(WEBHOOK_URL, { method: 'POST', body: form });
    if (res.ok) return true;
  } catch (e) { /* ниже — отправка «вслепую» */ }

  try {
    await fetch(WEBHOOK_URL, { method: 'POST', mode: 'no-cors', body: form });
    return true;
  } catch (e) {
    return false;
  }
}

function baseMessage(embed) {
  return {
    username: 'ЦИК Goxten',
    allowed_mentions: { parse: [] },
    embeds: [embed]
  };
}

function voteMessage(record, party) {
  return baseMessage({
    title: 'Голос принят',
    color: hexToInt(party ? party.color : null),
    fields: [
      { name: 'Избиратель', value: record.voter, inline: true },
      { name: 'Паспорт', value: '`' + record.passport + '`', inline: true },
      { name: 'Партия', value: party ? (party.short ? party.name + ' (' + party.short + ')' : party.name) : record.partyId },
      { name: 'Почему', value: record.reason ? record.reason.slice(0, 1000) : '— не указано —' },
      { name: 'Квитанция', value: '`' + record.receipt + '`', inline: true }
    ],
    footer: { text: 'Выборы мэра Goxten — 2026' },
    timestamp: record.at
  });
}

function adminRequestMessage(name) {
  return baseMessage({
    title: 'Начинать голосование?',
    description: 'Запрос отправлен с сайта. Ответьте на странице — кнопки «Да» и «Нет» в панели ЦИК.',
    color: 0xB8873B,
    fields: [
      { name: 'Инициатор', value: name, inline: true },
      { name: 'Окончание', value: formatDateTime(VOTING_DEADLINE), inline: true }
    ],
    footer: { text: 'Выборы мэра Goxten — 2026' },
    timestamp: new Date().toISOString()
  });
}

function adminDecisionMessage(started, name) {
  return baseMessage({
    title: started ? 'Голосование открыто' : 'Старт отклонён',
    description: started
      ? 'Участки открыты. Голоса будут приходить в этот канал до ' + formatDateTime(VOTING_DEADLINE) + '.'
      : 'Председатель отклонил запуск голосования.',
    color: started ? 0x2C6E53 : 0xA82318,
    fields: [{ name: 'Решение принял', value: name }],
    footer: { text: 'Выборы мэра Goxten — 2026' },
    timestamp: new Date().toISOString()
  });
}


/* ------------------------- рендер партий ------------------------- */

function renderParties() {
  const grid = $('#party-grid');
  const options = $('#ballot-options');
  grid.innerHTML = '';
  options.innerHTML = '';

  PARTIES.forEach((party, index) => {
    const no = String(index + 1).padStart(2, '0');

    /* карточка */
    const card = document.createElement('article');
    card.className = 'party-card';
    card.style.setProperty('--party-light', party.color);
    card.style.setProperty('--party-dark', party.colorDark || party.color);

    const top = document.createElement('div');
    top.className = 'party-card__top';

    const noBox = document.createElement('span');
    noBox.className = 'party-card__no';
    noBox.textContent = no;
    noBox.setAttribute('aria-label', 'Номер в бюллетене ' + (index + 1));

    const names = document.createElement('div');
    names.className = 'party-card__names';

    const name = document.createElement('h3');
    name.className = 'party-card__name';
    name.textContent = party.name;
    names.appendChild(name);

    if (party.short) {
      const short = document.createElement('span');
      short.className = 'party-card__short';
      short.textContent = party.short;
      names.appendChild(short);
    }

    top.append(noBox, names);
    card.appendChild(top);

    if (party.tag) {
      const tag = document.createElement('span');
      tag.className = 'party-card__tag';
      tag.textContent = party.tag;
      card.appendChild(tag);
    }

    if (party.program && party.program.length) {
      const label = document.createElement('p');
      label.className = 'party-card__program-label';
      label.textContent = 'Программа';
      card.appendChild(label);

      const list = document.createElement('ul');
      list.className = 'party-card__program';
      party.program.forEach((point) => {
        const li = document.createElement('li');
        li.textContent = point;
        list.appendChild(li);
      });
      card.appendChild(list);
    }

    if (party.note) {
      const note = document.createElement('p');
      note.className = 'party-card__note';
      note.textContent = party.note;
      card.appendChild(note);
    }

    grid.appendChild(card);

    /* строка бюллетеня */
    const option = document.createElement('label');
    option.className = 'ballot-option';
    option.style.setProperty('--party-light', party.color);
    option.style.setProperty('--party-dark', party.colorDark || party.color);

    const input = document.createElement('input');
    input.className = 'ballot-option__input';
    input.type = 'radio';
    input.name = 'party';
    input.value = party.id;
    input.id = 'party-' + party.id;

    const mark = document.createElement('span');
    mark.className = 'ballot-option__mark';
    mark.setAttribute('aria-hidden', 'true');

    const body = document.createElement('span');
    body.className = 'ballot-option__body';

    const optName = document.createElement('span');
    optName.className = 'ballot-option__name';
    optName.textContent = party.short ? party.name + ' (' + party.short + ')' : party.name;

    const meta = document.createElement('span');
    meta.className = 'ballot-option__meta';
    meta.textContent = [party.tag, party.note].filter(Boolean).join(' · ');

    body.append(optName, meta);

    const optNo = document.createElement('span');
    optNo.className = 'ballot-option__no';
    optNo.textContent = '№' + (index + 1);

    option.append(input, mark, body, optNo);
    options.appendChild(option);
  });

  $('#status-count').textContent =
    PARTIES.length + ' ' + plural(PARTIES.length, 'партия', 'партии', 'партий');

  options.addEventListener('change', () => {
    options.querySelectorAll('.ballot-option').forEach((el) => {
      el.classList.toggle('is-checked', el.querySelector('input').checked);
    });
    hideError('choice-error');
  });
}


/* ------------------------- сроки ------------------------- */

let scheduleState = 'open';

function adminStarted() {
  return store.get(STORAGE_STARTED) === true;
}

function computeState() {
  const now = Date.now();
  const end = new Date(VOTING_DEADLINE).getTime();
  const start = VOTING_START ? new Date(VOTING_START).getTime() : null;

  if (!isNaN(end) && now >= end) return 'after';
  if (start && !isNaN(start) && now < start && !adminStarted()) return 'before';
  return 'open';
}

function applySchedule() {
  scheduleState = computeState();

  const stateEl = $('#status-state');
  const countEl = $('#status-countdown');
  const notice = $('#ballot-notice');
  const btn = $('#submit-btn');
  const end = new Date(VOTING_DEADLINE);

  stateEl.classList.toggle('is-closed', scheduleState !== 'open');

  if (scheduleState === 'after') {
    stateEl.textContent = 'Голосование завершено';
    countEl.textContent = 'участки закрыты';
    notice.textContent = 'Голосование завершено ' + formatDateTime(VOTING_DEADLINE) + '. Бюллетени больше не принимаются.';
    notice.hidden = false;
    if (btn) { btn.disabled = true; btn.textContent = 'Голосование завершено'; }
    return;
  }

  if (scheduleState === 'before') {
    stateEl.textContent = 'Голосование не началось';
    countEl.textContent = 'до старта: ' + formatDateTime(VOTING_START);
    notice.textContent = 'Участки ещё не открыты. Голосование начнётся ' + formatDateTime(VOTING_START) + '.';
    notice.hidden = false;
    if (btn) { btn.disabled = true; btn.textContent = 'Участки закрыты'; }
    return;
  }

  stateEl.textContent = 'Голосование открыто';
  notice.hidden = true;
  if (btn) { btn.disabled = false; btn.textContent = 'Проголосовать'; }

  const left = end.getTime() - Date.now();
  if (isNaN(left)) { countEl.textContent = 'дата уточняется'; return; }

  const days = Math.floor(left / 86400000);
  const hours = Math.floor((left % 86400000) / 3600000);
  const mins = Math.floor((left % 3600000) / 60000);

  countEl.textContent = days > 0
    ? days + ' ' + plural(days, 'день', 'дня', 'дней') + ' ' + hours + ' ч'
    : hours + ' ч ' + mins + ' мин';
}

function renderDeadline() {
  $('#deadline-text').textContent = formatDateTime(VOTING_DEADLINE);
  applySchedule();
  setInterval(applySchedule, 30000);
}


/* ------------------------- валидация ------------------------- */

const NAME_RE = /^[А-Яа-яЁёA-Za-zÀ-ÿ][А-Яа-яЁёA-Za-zÀ-ÿ'\- ]{1,31}$/;

function showError(fieldId, errorId, message) {
  const err = document.getElementById(errorId);
  err.textContent = message;
  err.hidden = false;
  const field = fieldId ? document.getElementById(fieldId) : null;
  if (field) field.setAttribute('aria-invalid', 'true');
}

function hideError(errorId, fieldId) {
  const err = document.getElementById(errorId);
  if (err) { err.hidden = true; err.textContent = ''; }
  const field = fieldId ? document.getElementById(fieldId) : null;
  if (field) field.removeAttribute('aria-invalid');
}

function clearAllErrors() {
  ['first-name', 'last-name', 'middle-name', 'passport'].forEach((id) => {
    hideError(id + '-error', id);
  });
  hideError('choice-error');
  const status = $('#form-status');
  status.hidden = true;
  status.textContent = '';
  status.classList.remove('is-ok');
}

function validate(data) {
  const errors = [];

  if (!data.firstName) {
    errors.push(['first-name', 'first-name-error', 'Укажите имя персонажа.']);
  } else if (!NAME_RE.test(data.firstName)) {
    errors.push(['first-name', 'first-name-error', 'Имя: от 2 до 32 букв, без цифр.']);
  }

  if (!data.lastName) {
    errors.push(['last-name', 'last-name-error', 'Укажите фамилию персонажа.']);
  } else if (!NAME_RE.test(data.lastName)) {
    errors.push(['last-name', 'last-name-error', 'Фамилия: от 2 до 32 букв, без цифр.']);
  }

  if (data.middleName && !NAME_RE.test(data.middleName)) {
    errors.push(['middle-name', 'middle-name-error', 'Отчество: от 2 до 32 букв, без цифр.']);
  }

  if (!data.passport) {
    errors.push(['passport', 'passport-error', 'Введите номер игрового паспорта.']);
  } else if (data.passport.length < PASSPORT_MIN) {
    errors.push(['passport', 'passport-error',
      'Паспорт должен содержать не менее ' + PASSPORT_MIN + ' знаков.']);
  } else if (!/[0-9A-Za-zА-Яа-яЁё]/.test(data.passport)) {
    errors.push(['passport', 'passport-error', 'В паспорте должна быть хотя бы одна буква или цифра.']);
  }

  if (!data.partyId) {
    errors.push([null, 'choice-error', 'Отметьте одну партию в бюллетене.']);
  }

  return errors;
}


/* ------------------------- вспомогательное ------------------------- */

function setStatus(message, ok) {
  const status = $('#form-status');
  status.textContent = message;
  status.hidden = false;
  status.classList.toggle('is-ok', !!ok);
}

function markPassportUsed(hash) {
  const used = store.get(STORAGE_USED) || [];
  if (!used.includes(hash)) {
    used.push(hash);
    store.set(STORAGE_USED, used);
  }
}

function passportUsed(hash) {
  const used = store.get(STORAGE_USED) || [];
  return used.includes(hash);
}

function showForm() {
  $('#receipt').hidden = true;
  $('#admin-panel').hidden = true;
  $('#vote-form').hidden = false;
}


/* ------------------------- панель ЦИК ------------------------- */

function renderAdminPanel(name) {
  const panel = $('#admin-panel');
  panel.innerHTML = '';

  const mark = document.createElement('span');
  mark.className = 'admin-panel__mark';
  mark.textContent = 'Панель ЦИК';

  const title = document.createElement('h3');
  title.className = 'admin-panel__title';
  title.textContent = 'Начинать голосование?';

  const text = document.createElement('p');
  text.className = 'admin-panel__text';
  text.textContent = 'Запрос отправлен в Discord-канал ЦИК. Решение принимается здесь: после «Да» в канал уйдёт объявление об открытии участков, и каждый поданный голос будет приходить туда же.';

  const state = document.createElement('p');
  state.className = 'admin-panel__state';
  state.textContent = adminStarted()
    ? 'Сейчас: голосование объявлено открытым.'
    : 'Сейчас: старт не объявлен.';

  const actions = document.createElement('div');
  actions.className = 'admin-panel__actions';

  const yes = document.createElement('button');
  yes.type = 'button';
  yes.className = 'btn';
  yes.textContent = 'Да, начинать';

  const no = document.createElement('button');
  no.type = 'button';
  no.className = 'btn btn--ghost';
  no.textContent = 'Нет';

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'receipt__again';
  back.textContent = 'Вернуться к бюллетеню';
  back.addEventListener('click', () => {
    $('#vote-form').reset();
    document.querySelectorAll('.ballot-option').forEach((el) => el.classList.remove('is-checked'));
    clearAllErrors();
    showForm();
  });

  const result = document.createElement('p');
  result.className = 'admin-panel__result';
  result.hidden = true;

  const decide = async (started) => {
    yes.disabled = true;
    no.disabled = true;
    result.hidden = false;
    result.textContent = 'Отправляем решение…';

    const ok = await sendToWebhook(adminDecisionMessage(started, name));
    store.set(STORAGE_STARTED, started);
    applySchedule();

    result.classList.toggle('is-ok', started);
    result.textContent = (started ? 'Голосование объявлено открытым. ' : 'Старт отклонён. ') +
      (ok ? 'Сообщение ушло в Discord.' : 'Discord не ответил — проверьте вебхук.');
    state.textContent = started
      ? 'Сейчас: голосование объявлено открытым.'
      : 'Сейчас: старт не объявлен.';
  };

  yes.addEventListener('click', () => decide(true));
  no.addEventListener('click', () => decide(false));

  actions.append(yes, no);
  panel.append(mark, title, text, state, actions, result, back);

  panel.hidden = false;
  $('#vote-form').hidden = true;
  $('#receipt').hidden = true;
}


/* ------------------------- квитанция ------------------------- */

function renderReceipt(record, options) {
  const opts = options || {};
  const party = partyById(record.partyId);
  const box = $('#receipt');
  box.innerHTML = '';

  const mark = document.createElement('span');
  mark.className = 'receipt__mark';
  mark.textContent = 'Голос учтён';

  const title = document.createElement('h3');
  title.className = 'receipt__title';
  title.textContent = opts.returning ? 'Вы уже проголосовали' : 'Спасибо, бюллетень принят';

  const text = document.createElement('p');
  text.className = 'receipt__text';
  text.textContent = record.delivered
    ? 'Бюллетень передан в ЦИК Goxten. Повторное голосование с этим паспортом заблокировано.'
    : 'Бюллетень сохранён на этом устройстве, но до ЦИК не дошёл — проверьте связь с Discord. Повторное голосование с этим паспортом заблокировано.';

  const rows = document.createElement('dl');
  rows.className = 'receipt__rows';

  const addRow = (label, value, mono) => {
    const row = document.createElement('div');
    row.className = 'receipt__row';
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    if (mono) dd.classList.add('is-mono');
    row.append(dt, dd);
    rows.appendChild(row);
  };

  addRow('Избиратель', record.voter);
  addRow('Партия', party ? (party.short || party.name) : record.partyId);
  addRow('Номер квитанции', record.receipt, true);
  addRow('Время', formatDateTime(record.at));

  const again = document.createElement('button');
  again.className = 'receipt__again';
  again.type = 'button';
  again.textContent = 'Голосует другой гражданин';
  again.addEventListener('click', () => {
    const form = $('#vote-form');
    form.reset();
    document.querySelectorAll('.ballot-option').forEach((el) => el.classList.remove('is-checked'));
    const counter = $('#reason-count');
    if (counter) counter.textContent = '0';
    clearAllErrors();
    showForm();
    $('#first-name').focus();
  });

  box.append(mark, title, text, rows, again);
  box.hidden = false;
  $('#vote-form').hidden = true;
  $('#admin-panel').hidden = true;
}


/* ------------------------- запуск ------------------------- */

function init() {
  renderParties();
  renderDeadline();

  const form = $('#vote-form');
  const submitBtn = $('#submit-btn');
  const reason = $('#reason');
  const reasonCount = $('#reason-count');

  if (reason && reasonCount) {
    reason.addEventListener('input', () => {
      reasonCount.textContent = String(reason.value.length);
    });
  }

  /* если с этого устройства уже голосовали — показываем квитанцию */
  const saved = store.get(STORAGE_VOTE);
  if (saved && saved.partyId) {
    renderReceipt(saved, { returning: true });
  }

  ['first-name', 'last-name', 'middle-name', 'passport'].forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => hideError(id + '-error', id));
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearAllErrors();

    /* ловушка для ботов: люди это поле не видят */
    if (form.elements.website && form.elements.website.value.trim() !== '') {
      setStatus('Бюллетень не принят. Обновите страницу и попробуйте снова.', false);
      return;
    }

    const checked = form.querySelector('input[name="party"]:checked');
    const data = {
      firstName: form.elements.firstName.value.trim(),
      lastName: form.elements.lastName.value.trim(),
      middleName: form.elements.middleName.value.trim(),
      passport: form.elements.passport.value.trim(),
      reason: reason ? reason.value.trim() : '',
      partyId: checked ? checked.value : ''
    };

    const fullName = [data.lastName, data.firstName, data.middleName].filter(Boolean).join(' ');

    /* ФИО председателя ЦИК — вместо голоса открывается панель управления */
    if (isAdmin(data)) {
      renderAdminPanel(fullName);
      $('#admin-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
      sendToWebhook(adminRequestMessage(fullName));
      return;
    }

    if (scheduleState !== 'open') {
      setStatus(scheduleState === 'after'
        ? 'Голосование завершено — участки закрыты.'
        : 'Голосование ещё не началось.', false);
      return;
    }

    const errors = validate(data);
    if (errors.length) {
      errors.forEach(([fieldId, errorId, message]) => showError(fieldId, errorId, message));
      const firstField = errors[0][0];
      (firstField ? document.getElementById(firstField) : $('#ballot-options')).focus?.();
      setStatus('Проверьте отмеченные поля — бюллетень не отправлен.', false);
      return;
    }

    const hash = fingerprint(data.passport);
    if (passportUsed(hash)) {
      showError('passport', 'passport-error', 'С этим паспортом уже проголосовали.');
      setStatus('Повторное голосование с одним паспортом невозможно.', false);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Отправляем…';

    const record = {
      voter: fullName,
      passport: data.passport,
      reason: data.reason,
      partyId: data.partyId,
      receipt: receiptId(),
      at: new Date().toISOString()
    };

    const party = partyById(record.partyId);
    const delivered = await sendToWebhook(voteMessage(record, party));

    if (API_ENDPOINT) {
      try {
        await fetch(API_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({ election: 'goxten-mayor-2026', passportHash: hash }, record))
        });
      } catch (e) { /* бэкенд необязателен */ }
    }

    /* в браузере паспорт не остаётся — только отпечаток */
    const localRecord = {
      voter: record.voter,
      partyId: record.partyId,
      receipt: record.receipt,
      at: record.at,
      delivered: delivered
    };

    markPassportUsed(hash);
    store.set(STORAGE_VOTE, localRecord);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Проголосовать';

    renderReceipt(localRecord, { returning: false });
    $('#receipt').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
