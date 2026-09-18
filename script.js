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

/* Расписание голосования. Участки открыты только внутри этих окон.
   Чтобы добавить тур — допишите строку, чтобы убрать — удалите.
   Формат: ISO-дата со смещением, +03:00 — московское время. */
const VOTING_WINDOWS = [
  { start: '2026-09-21T08:00:00+03:00', end: '2026-09-21T21:00:00+03:00' },
  { start: '2026-09-23T08:00:00+03:00', end: '2026-09-23T23:59:00+03:00' }
];

/* Тестовый режим: true — участки открыты всегда, расписание игнорируется.
   В шапке появится заметная пометка. Перед тем как звать игроков — верните false. */
const TEST_MODE = false;

/* ФИО председателя ЦИК. Если ввести его в бюллетень — вместо голоса
   откроется панель ЦИК и в Discord уйдёт запрос «начинать голосование?».
   Порядок полей и регистр не важны.
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

function formatDay(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'long' });
}

function formatTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

/* «2 дня 5 ч» или «5 ч 20 мин» или «12 мин» */
function humanLeft(ms) {
  if (!isFinite(ms) || ms < 0) return '—';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (days > 0) return days + ' ' + plural(days, 'день', 'дня', 'дней') + ' ' + hours + ' ч';
  if (hours > 0) return hours + ' ч ' + mins + ' мин';
  return Math.max(mins, 1) + ' ' + plural(Math.max(mins, 1), 'минута', 'минуты', 'минут');
}

function normalize(text) {
  return (text || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

/* Ключ ФИО, не зависящий от порядка полей: неважно, в «Имя» или «Фамилию»
   попало каждое слово — панель ЦИК откроется в любом случае. */
function nameKey(parts) {
  return parts.map(normalize).filter(Boolean).sort().join('|');
}

function isAdmin(data) {
  const key = nameKey([data.lastName, data.firstName, data.middleName]);
  if (!key) return false;
  return ADMIN_NAMES.some((a) => nameKey([a.lastName, a.firstName, a.middleName]) === key);
}

function hexToInt(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  return m ? parseInt(m[1], 16) : 0x9AA3AE;
}


/* ------------------------- расписание ------------------------- */

const WINDOWS = VOTING_WINDOWS
  .map((w) => ({ start: new Date(w.start).getTime(), end: new Date(w.end).getTime(), raw: w }))
  .filter((w) => !isNaN(w.start) && !isNaN(w.end))
  .sort((a, b) => a.start - b.start);

const LAST_END = WINDOWS.length ? WINDOWS[WINDOWS.length - 1].raw.end : null;

let votingState = 'before';
let currentWindow = null;
let nextWindow = null;

function computeState() {
  const now = Date.now();
  currentWindow = null;
  nextWindow = null;

  if (TEST_MODE) return 'open';
  if (!WINDOWS.length) return 'after';

  for (const w of WINDOWS) {
    if (now >= w.start && now < w.end) { currentWindow = w; return 'open'; }
    if (now < w.start) { nextWindow = w; break; }
  }

  if (nextWindow) return WINDOWS[0] === nextWindow ? 'before' : 'pause';
  return 'after';
}

/* Расписание одной строкой: «21 сентября, 08:00–21:00 · 23 сентября, 08:00–23:59» */
function scheduleLine() {
  if (!WINDOWS.length) return 'расписание не задано';
  return WINDOWS
    .map((w) => formatDay(w.raw.start) + ', ' + formatTime(w.raw.start) + '–' + formatTime(w.raw.end))
    .join(' · ');
}

function applyState() {
  votingState = computeState();

  const stateEl = $('#status-state');
  const countEl = $('#status-countdown');
  const countLabel = $('#status-countdown-label');
  const notice = $('#ballot-notice');
  const btn = $('#submit-btn');
  const now = Date.now();

  const LABELS = {
    open: 'До закрытия участков',
    before: 'До начала голосования',
    pause: 'До следующего тура',
    after: 'Голосование'
  };
  if (countLabel) countLabel.textContent = LABELS[votingState] || LABELS.open;

  stateEl.classList.toggle('is-closed', votingState !== 'open');

  /* Кнопку не блокируем: через неё председатель ЦИК попадает в панель,
     даже когда участки закрыты. Голос при этом всё равно не примется. */
  if (btn) btn.classList.toggle('is-locked', votingState !== 'open');

  if (votingState === 'open') {
    stateEl.textContent = TEST_MODE ? 'Тестовый режим' : 'Голосование открыто';
    countEl.textContent = TEST_MODE
      ? 'расписание отключено'
      : humanLeft(currentWindow.end - now);
    notice.hidden = !TEST_MODE;
    if (TEST_MODE) {
      notice.textContent = 'Тестовый режим: участки открыты независимо от расписания. ' +
        'Перед началом выборов поставьте TEST_MODE = false в script.js.';
    }
    return;
  }

  notice.hidden = false;

  if (votingState === 'before') {
    stateEl.textContent = 'Голосование не началось';
    countEl.textContent = humanLeft(nextWindow.start - now);
    notice.textContent = 'Участки откроются ' + formatDateTime(nextWindow.raw.start) +
      '. Расписание: ' + scheduleLine() + '.';
    return;
  }

  if (votingState === 'pause') {
    stateEl.textContent = 'Перерыв между турами';
    countEl.textContent = humanLeft(nextWindow.start - now);
    notice.textContent = 'Участки закрыты до ' + formatDateTime(nextWindow.raw.start) +
      '. Расписание: ' + scheduleLine() + '.';
    return;
  }

  stateEl.textContent = 'Голосование завершено';
  countEl.textContent = 'участки закрыты';
  notice.textContent = LAST_END
    ? 'Голосование завершено ' + formatDateTime(LAST_END) + '. Бюллетени больше не принимаются.'
    : 'Расписание голосования не задано.';
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
    description: 'Председатель открыл панель ЦИК на сайте.',
    color: 0xB8873B,
    fields: [
      { name: 'Инициатор', value: name, inline: true },
      { name: 'Расписание', value: scheduleLine() }
    ],
    footer: { text: 'Выборы мэра Goxten — 2026' },
    timestamp: new Date().toISOString()
  });
}

function announceMessage(open, name) {
  return baseMessage({
    title: open ? 'Участки открыты' : 'Участки закрыты',
    description: open
      ? 'Голосование идёт. Бюллетени принимаются по расписанию: ' + scheduleLine() + '.'
      : 'Приём бюллетеней закрыт. Расписание: ' + scheduleLine() + '.',
    color: open ? 0x2C6E53 : 0xA82318,
    fields: [{ name: 'Объявил', value: name }],
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
  text.textContent = 'Приём бюллетеней включается и выключается по расписанию — кнопки ниже только объявляют это в Discord-канале ЦИК. Чтобы сдвинуть сроки, поменяйте VOTING_WINDOWS в начале script.js.';

  const state = document.createElement('p');
  state.className = 'admin-panel__state';
  const stateLabel = () => {
    if (votingState === 'open') return 'Сейчас: участки открыты. Расписание — ' + scheduleLine() + '.';
    if (votingState === 'pause') return 'Сейчас: перерыв между турами. Расписание — ' + scheduleLine() + '.';
    if (votingState === 'after') return 'Сейчас: голосование завершено.';
    return 'Сейчас: голосование ещё не началось. Расписание — ' + scheduleLine() + '.';
  };
  state.textContent = stateLabel();

  const actions = document.createElement('div');
  actions.className = 'admin-panel__actions';

  const yes = document.createElement('button');
  yes.type = 'button';
  yes.className = 'btn';
  yes.textContent = 'Объявить открытие';

  const no = document.createElement('button');
  no.type = 'button';
  no.className = 'btn btn--ghost';
  no.textContent = 'Объявить закрытие';

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

  const announce = async (open) => {
    yes.disabled = true;
    no.disabled = true;
    result.hidden = false;
    result.classList.remove('is-ok');
    result.textContent = 'Отправляем объявление…';

    const ok = await sendToWebhook(announceMessage(open, name));
    applyState();
    state.textContent = stateLabel();

    result.classList.toggle('is-ok', ok && open);
    result.textContent = ok
      ? (open ? 'Объявление об открытии ушло в Discord.' : 'Объявление о закрытии ушло в Discord.')
      : 'Discord не принял сообщение — проверьте вебхук.';

    yes.disabled = false;
    no.disabled = false;
  };

  yes.addEventListener('click', () => announce(true));
  no.addEventListener('click', () => announce(false));

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

  $('#deadline-text').textContent = scheduleLine();
  applyState();
  setInterval(applyState, 20000);

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

    applyState();
    if (votingState !== 'open') {
      setStatus($('#ballot-notice').textContent, false);
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
