let todos = [];
let outcomes = [];
let settings = { nowWeeks: 4, nextWeeks: 8 };
let formPlacement = 'unplaced';

// ─── API ──────────────────────────────────────────────────────────────────────

async function apiFetch(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 204) return null;
  return res.json();
}

async function loadAll() {
  [todos, outcomes, settings] = await Promise.all([
    apiFetch('GET', '/api/todos'),
    apiFetch('GET', '/api/outcomes'),
    apiFetch('GET', '/api/settings')
  ]);
  renderSettingsPanel();
  renderOutcomesSummary();
  renderOutcomeSelect();
  renderOutcomesView();
}

function renderOutcomesSummary() {
  const el = document.getElementById('outcomes-summary-list');
  if (outcomes.length === 0) {
    el.innerHTML = '<p class="outcomes-summary-empty">No outcomes yet — add one below.</p>';
    return;
  }
  el.innerHTML = `<ul class="outcomes-summary-list">
    ${outcomes.map(o => `
      <li class="outcomes-summary-item">
        <span class="outcomes-summary-dot" style="background:${o.colour}"></span>
        <span class="outcomes-summary-statement">${escapeHtml(o.statement)}</span>
      </li>`).join('')}
  </ul>`;
}

// ─── Auto-placement from due date ─────────────────────────────────────────────

function computePlacement(isoDate) {
  if (!isoDate) return 'unplaced';
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const due = new Date(isoDate + 'T00:00:00');
  const days = Math.round((due - now) / 86400000);
  if (days <= settings.nowWeeks * 7)  return 'now';
  if (days <= settings.nextWeeks * 7) return 'next';
  return 'later';
}

function setFormPlacement(placement) {
  formPlacement = placement;
  document.querySelectorAll('#form-placement-btns .placement-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.placement === placement);
  });
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function renderSettingsPanel() {
  document.getElementById('setting-now-weeks').value  = settings.nowWeeks;
  document.getElementById('setting-next-weeks').value = settings.nextWeeks;
}

document.getElementById('settings-toggle').addEventListener('click', () => {
  document.getElementById('settings-panel').hidden = !document.getElementById('settings-panel').hidden;
});

document.getElementById('save-settings-btn').addEventListener('click', async () => {
  const nowWeeks  = parseInt(document.getElementById('setting-now-weeks').value);
  const nextWeeks = parseInt(document.getElementById('setting-next-weeks').value);
  if (isNaN(nowWeeks) || isNaN(nextWeeks) || nowWeeks >= nextWeeks) {
    alert('"Now" weeks must be less than "Next" weeks.');
    return;
  }
  settings = await apiFetch('PATCH', '/api/settings', { nowWeeks, nextWeeks });
  document.getElementById('settings-panel').hidden = true;
});

// ─── Render: outcome select in add form ──────────────────────────────────────

function renderOutcomeSelect() {
  const sel = document.getElementById('outcome-select');
  const current = sel.value;
  sel.innerHTML = '<option value="">No outcome</option>' +
    outcomes.map(o =>
      `<option value="${o.id}"${o.id == current ? ' selected' : ''}>${escapeHtml(o.statement)}</option>`
    ).join('');
}

// ─── Render: main outcomes view ───────────────────────────────────────────────

function renderOutcomesView() {
  const view = document.getElementById('outcomes-view');
  const sections = [];

  outcomes.forEach(outcome => {
    const linked = todos.filter(t => t.outcomeIds && t.outcomeIds.includes(outcome.id));
    sections.push(renderOutcomeSection(outcome, linked));
  });

  const unassigned = todos.filter(t => !t.outcomeIds || t.outcomeIds.length === 0);
  if (unassigned.length > 0 || outcomes.length === 0) {
    sections.push(renderUnassignedSection(unassigned));
  }

  view.innerHTML = sections.join('');
  attachTodoHandlers();
  attachOutcomeHandlers();
}

function renderOutcomeSection(outcome, linkedTodos) {
  const active   = linkedTodos.filter(t => !t.completed);
  const done     = linkedTodos.filter(t => t.completed);
  const now      = active.filter(t => t.placement === 'now');
  const next     = active.filter(t => t.placement === 'next');
  const later    = active.filter(t => t.placement === 'later');
  const unplaced = active.filter(t => !t.placement || t.placement === 'unplaced');

  return `
    <section class="outcome-section" data-outcome-id="${outcome.id}">
      <div class="outcome-header">
        <span class="outcome-dot" style="background:${outcome.colour}"></span>
        <h2>${escapeHtml(outcome.statement)}</h2>
        <button class="outcome-edit-btn" data-outcome-id="${outcome.id}">Edit</button>
      </div>
      <div class="outcome-edit-form" id="edit-form-${outcome.id}" hidden>
        <input type="text" value="${escapeHtml(outcome.statement)}" data-outcome-id="${outcome.id}" />
        <button class="outcome-save-btn"   data-outcome-id="${outcome.id}">Save</button>
        <button class="outcome-delete-btn" data-outcome-id="${outcome.id}">Delete</button>
        <button class="outcome-cancel-btn" data-outcome-id="${outcome.id}">Cancel</button>
      </div>
      ${renderPlacementGroup('now',      now,      outcome)}
      ${renderPlacementGroup('next',     next,     outcome)}
      ${renderPlacementGroup('later',    later,    outcome)}
      ${unplaced.length ? renderPlacementGroup('unplaced', unplaced, outcome) : ''}
      ${done.length ? `
        <details class="done-group">
          <summary>Done (${done.length})</summary>
          <ul class="done-list todo-list">${done.map(t => renderTodoItem(t, outcome)).join('')}</ul>
        </details>` : ''}
    </section>`;
}

function renderPlacementGroup(placement, items, outcome) {
  const labels = { now: 'Now', next: 'Next', later: 'Later', unplaced: 'Unplaced' };
  return `
    <div class="placement-group" data-placement="${placement}">
      <div class="placement-group-label">${labels[placement]}</div>
      ${items.length
        ? `<ul class="todo-list">${items.map(t => renderTodoItem(t, outcome)).join('')}</ul>`
        : `<div class="placement-group-empty">Nothing here yet</div>`}
    </div>`;
}

function renderUnassignedSection(items) {
  const active = items.filter(t => !t.completed);
  const done   = items.filter(t => t.completed);
  return `
    <section class="outcome-section unassigned">
      <div class="outcome-header"><h2>Unassigned</h2></div>
      <div class="placement-group">
        ${active.length
          ? `<ul class="todo-list">${active.map(t => renderTodoItem(t, null)).join('')}</ul>`
          : `<div class="placement-group-empty" style="padding:10px 0">No unassigned todos</div>`}
      </div>
      ${done.length ? `
        <details class="done-group">
          <summary>Done (${done.length})</summary>
          <ul class="done-list todo-list">${done.map(t => renderTodoItem(t, null)).join('')}</ul>
        </details>` : ''}
    </section>`;
}

function renderTodoItem(todo, currentOutcome) {
  let dueHtml = '';
  if (todo.dueDate) {
    const { text, cls } = formatDueDate(todo.dueDate, todo.completed);
    dueHtml = `<span class="${cls}">${text}</span>`;
  }

  // Outcome assignment dropdown — only shown on unassigned todos (no outcomes)
  let assignHtml = '';
  if (!currentOutcome && outcomes.length > 0 && !todo.completed) {
    assignHtml = `<select class="todo-assign-outcome" data-todo-id="${todo.id}">
      <option value="">+ assign outcome</option>
      ${outcomes.map(o => `<option value="${o.id}">${escapeHtml(o.statement)}</option>`).join('')}
    </select>`;
  }

  let placementHtml = '';
  if (!todo.completed) {
    placementHtml = `<div class="todo-placement-btns">
      ${['now','next','later'].map(p => `
        <button class="todo-placement-btn ${todo.placement === p ? 'active' : ''}"
          data-placement="${p}" data-todo-id="${todo.id}">${p[0].toUpperCase() + p.slice(1)}</button>
      `).join('')}
    </div>`;
  }

  return `
    <li class="todo-item ${todo.completed ? 'completed' : ''}" data-todo-id="${todo.id}">
      <input type="checkbox" ${todo.completed ? 'checked' : ''} data-todo-id="${todo.id}" />
      <div class="todo-text-wrap">
        <div class="todo-text">${escapeHtml(todo.text)}</div>
        ${(dueHtml || assignHtml)
          ? `<div class="todo-meta">${dueHtml}${assignHtml}</div>` : ''}
      </div>
      ${placementHtml}
      <button class="delete-btn" data-todo-id="${todo.id}" title="Delete">✕</button>
    </li>`;
}

// ─── Event delegation ─────────────────────────────────────────────────────────

function attachTodoHandlers() {
  const view = document.getElementById('outcomes-view');

  view.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', async () => {
      const id = parseInt(cb.dataset.todoId);
      const todo = todos.find(t => t.id === id);
      const updated = await apiFetch('PATCH', `/api/todos/${id}`, { completed: !todo.completed });
      todos = todos.map(t => t.id === id ? updated : t);
      renderOutcomesView();
    });
  });

  view.querySelectorAll('.todo-placement-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.todoId);
      const placement = btn.dataset.placement;
      const todo = todos.find(t => t.id === id);
      const newPlacement = todo.placement === placement ? 'unplaced' : placement;
      const updated = await apiFetch('PATCH', `/api/todos/${id}`, { placement: newPlacement });
      todos = todos.map(t => t.id === id ? updated : t);
      renderOutcomesView();
    });
  });

  view.querySelectorAll('.todo-assign-outcome').forEach(sel => {
    sel.addEventListener('change', async () => {
      const id = parseInt(sel.dataset.todoId);
      const outcomeId = parseInt(sel.value);
      if (!outcomeId) return;
      const todo = todos.find(t => t.id === id);
      const outcomeIds = [...new Set([...(todo.outcomeIds || []), outcomeId])];
      const updated = await apiFetch('PATCH', `/api/todos/${id}`, { outcomeIds });
      todos = todos.map(t => t.id === id ? updated : t);
      renderOutcomesView();
    });
  });

  view.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.todoId);
      await apiFetch('DELETE', `/api/todos/${id}`);
      todos = todos.filter(t => t.id !== id);
      renderOutcomesView();
    });
  });
}

function attachOutcomeHandlers() {
  const view = document.getElementById('outcomes-view');

  view.querySelectorAll('.outcome-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.outcomeId;
      document.getElementById(`edit-form-${id}`).hidden = false;
      btn.hidden = true;
    });
  });

  view.querySelectorAll('.outcome-save-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.outcomeId);
      const input = btn.closest('.outcome-edit-form').querySelector('input');
      const statement = input.value.trim();
      if (!statement) return;
      const updated = await apiFetch('PATCH', `/api/outcomes/${id}`, { statement });
      outcomes = outcomes.map(o => o.id === id ? updated : o);
      renderOutcomesSummary();
      renderOutcomeSelect();
      renderOutcomesView();
    });
  });

  view.querySelectorAll('.outcome-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.outcomeId);
      if (!confirm('Delete this outcome? Todos will become unassigned.')) return;
      await apiFetch('DELETE', `/api/outcomes/${id}`);
      outcomes = outcomes.filter(o => o.id !== id);
      todos = todos.map(t => ({ ...t, outcomeIds: (t.outcomeIds || []).filter(oid => oid !== id) }));
      renderOutcomesSummary();
      renderOutcomeSelect();
      renderOutcomesView();
    });
  });

  view.querySelectorAll('.outcome-cancel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.outcomeId;
      document.getElementById(`edit-form-${id}`).hidden = true;
      btn.closest('.outcome-section').querySelector('.outcome-edit-btn').hidden = false;
    });
  });
}

// ─── Add todo form ─────────────────────────────────────────────────────────────

document.getElementById('form-placement-btns').addEventListener('click', e => {
  const btn = e.target.closest('.placement-btn');
  if (!btn) return;
  const selected = btn.dataset.placement;
  setFormPlacement(formPlacement === selected ? 'unplaced' : selected);
});

document.getElementById('add-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (dateWrap.classList.contains('invalid')) return;

  const text      = document.getElementById('todo-input').value.trim();
  const dueDate   = duePicker.value || null;
  const outcomeId = document.getElementById('outcome-select').value;
  const outcomeIds = outcomeId ? [parseInt(outcomeId)] : [];

  const todo = await apiFetch('POST', '/api/todos', {
    text, dueDate, placement: formPlacement, outcomeIds
  });
  todos.push(todo);

  e.target.reset();
  setFormPlacement('unplaced');
  clearDate();
  closeAutocomplete();
  renderOutcomeSelect();
  renderOutcomesView();
});

// ─── Add outcome form ─────────────────────────────────────────────────────────

document.getElementById('add-outcome-btn').addEventListener('click', () => {
  document.getElementById('add-outcome-form').hidden = false;
  document.getElementById('add-outcome-btn').hidden = true;
  document.getElementById('outcome-input').focus();
});

document.getElementById('cancel-outcome-btn').addEventListener('click', () => {
  document.getElementById('add-outcome-form').hidden = true;
  document.getElementById('add-outcome-btn').hidden = false;
  document.getElementById('outcome-input').value = '';
});

document.getElementById('add-outcome-form').addEventListener('submit', async e => {
  e.preventDefault();
  const statement = document.getElementById('outcome-input').value.trim();
  if (!statement) return;
  const outcome = await apiFetch('POST', '/api/outcomes', { statement });
  outcomes.push(outcome);
  document.getElementById('outcome-input').value = '';
  document.getElementById('add-outcome-form').hidden = true;
  document.getElementById('add-outcome-btn').hidden = false;
  renderOutcomesSummary();
  renderOutcomeSelect();
  renderOutcomesView();
});

// ─── Date input ───────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'Today', 'Tomorrow',
  'This weekend', 'End of week', 'End of month',
  'Next week', 'Next month', 'Next weekend',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'Next Monday', 'Next Tuesday', 'Next Wednesday', 'Next Thursday', 'Next Friday', 'Next Saturday', 'Next Sunday',
];

function getSuggestions(input) {
  const q = input.trim().toLowerCase();
  if (!q) return [];
  return SUGGESTIONS.filter(s => s.toLowerCase().startsWith(q));
}

const naturalInput     = document.getElementById('natural-date-input');
const duePicker        = document.getElementById('due-input');
const dateHint         = document.getElementById('date-hint');
const dateWrap         = document.querySelector('.date-input-wrap');
const autocompleteList = document.getElementById('autocomplete-list');
let activeIdx = -1;

function closeAutocomplete() { autocompleteList.hidden = true; activeIdx = -1; }

function applyDate(isoDate) {
  duePicker.value = isoDate;
  const { text } = formatDueDate(isoDate, false);
  dateHint.textContent = `→ ${text}`;
  dateHint.className = 'hint-valid';
  dateWrap.classList.remove('invalid');
  dateWrap.classList.add('valid');
  // Auto-set placement only if user hasn't manually chosen one
  if (formPlacement === 'unplaced') {
    setFormPlacement(computePlacement(isoDate));
  }
}

function clearDate() {
  duePicker.value = '';
  dateHint.textContent = '';
  dateHint.className = '';
  dateWrap.classList.remove('valid', 'invalid');
  setFormPlacement('unplaced');
}

function showError(msg) {
  duePicker.value = '';
  dateHint.textContent = msg;
  dateHint.className = 'hint-invalid';
  dateWrap.classList.remove('valid');
  dateWrap.classList.add('invalid');
}

function renderAutocomplete(suggestions) {
  if (!suggestions.length) { closeAutocomplete(); return; }
  autocompleteList.innerHTML = suggestions.map((s, i) => {
    const result = parseNaturalDate(s);
    const preview = result.date ? formatDueDate(result.date, false).text : '';
    return `<li data-value="${s}" class="${i === activeIdx ? 'active' : ''}">
      <span>${s}</span>
      ${preview ? `<span class="suggestion-date">${preview}</span>` : ''}
    </li>`;
  }).join('');
  autocompleteList.hidden = false;
}

function selectSuggestion(value) {
  naturalInput.value = value;
  closeAutocomplete();
  const result = parseNaturalDate(value);
  if (result.date) applyDate(result.date);
}

naturalInput.addEventListener('input', () => {
  const raw = naturalInput.value;
  const result = parseNaturalDate(raw);
  if (result.error === null) clearDate();
  else if (result.error) showError(result.error);
  else applyDate(result.date);
  activeIdx = -1;
  renderAutocomplete(getSuggestions(raw));
});

naturalInput.addEventListener('keydown', e => {
  const items = [...autocompleteList.querySelectorAll('li')];
  if (e.key === 'ArrowDown') {
    if (!items.length) return;
    e.preventDefault();
    activeIdx = (activeIdx + 1) % items.length;
    renderAutocomplete(getSuggestions(naturalInput.value));
  } else if (e.key === 'ArrowUp') {
    if (!items.length) return;
    e.preventDefault();
    activeIdx = (activeIdx - 1 + items.length) % items.length;
    renderAutocomplete(getSuggestions(naturalInput.value));
  } else if (e.key === 'Enter') {
    if (dateWrap.classList.contains('valid')) { closeAutocomplete(); }
    else if (items.length) { e.preventDefault(); selectSuggestion((activeIdx >= 0 ? items[activeIdx] : items[0]).dataset.value); }
  } else if (e.key === 'Tab') {
    if (!items.length) return;
    e.preventDefault();
    selectSuggestion((activeIdx >= 0 ? items[activeIdx] : items[0]).dataset.value);
  } else if (e.key === 'Escape') {
    closeAutocomplete();
  }
});

autocompleteList.addEventListener('mousedown', e => {
  const li = e.target.closest('li');
  if (li) { e.preventDefault(); selectSuggestion(li.dataset.value); }
});

document.addEventListener('click', e => {
  if (!dateWrap.contains(e.target)) closeAutocomplete();
});

document.getElementById('calendar-btn').addEventListener('click', () => {
  try { duePicker.showPicker(); } catch { duePicker.click(); }
});

duePicker.addEventListener('change', () => {
  if (!duePicker.value) { clearDate(); naturalInput.value = ''; return; }
  const { text } = formatDueDate(duePicker.value, false);
  naturalInput.value = text;
  applyDate(duePicker.value);
  closeAutocomplete();
});

// ─── Analyse my todos ─────────────────────────────────────────────────────────

document.getElementById('analyse-btn').addEventListener('click', async () => {
  const btn = document.getElementById('analyse-btn');
  const panel = document.getElementById('analysis-panel');
  const results = document.getElementById('analysis-results');

  btn.disabled = true;
  btn.textContent = '✦ Analysing…';
  panel.hidden = false;
  results.innerHTML = '<div class="analysis-loading">Reading your todos and thinking about what you\'re working towards…</div>';

  try {
    const data = await apiFetch('POST', '/api/analyse');
    if (data.error) {
      results.innerHTML = `<div class="analysis-loading">${data.error}</div>`;
      return;
    }
    renderAnalysisSuggestions(data.outcomes);
  } catch (err) {
    results.innerHTML = '<div class="analysis-loading">Something went wrong. Please try again.</div>';
  } finally {
    btn.disabled = false;
    btn.textContent = '✦ Analyse my todos';
  }
});

document.getElementById('analysis-close-btn').addEventListener('click', () => {
  document.getElementById('analysis-panel').hidden = true;
});

function renderAnalysisSuggestions(suggestions) {
  const results = document.getElementById('analysis-results');

  results.innerHTML = suggestions.map((s, i) => `
    <div class="analysis-suggestion" data-idx="${i}">
      <div class="suggestion-statement">
        <input type="text" value="${escapeHtml(s.statement)}" data-idx="${i}" />
      </div>
      <p class="suggestion-rationale">${escapeHtml(s.rationale)}</p>
      ${s.relatedTodoIds.length ? `
        <ul class="suggestion-todos">
          ${s.relatedTodoIds.map(id => {
            const todo = todos.find(t => t.id === id);
            return todo ? `
              <li class="suggestion-todo">
                <input type="checkbox" checked data-todo-id="${id}" data-idx="${i}" />
                <span>${escapeHtml(todo.text)}</span>
              </li>` : '';
          }).join('')}
        </ul>` : ''}
      <div class="suggestion-actions">
        <button class="suggestion-accept-btn" data-idx="${i}">Accept</button>
        <button class="suggestion-dismiss-btn" data-idx="${i}">Dismiss</button>
      </div>
    </div>
  `).join('');

  // Accept
  results.querySelectorAll('.suggestion-accept-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx);
      const card = results.querySelector(`.analysis-suggestion[data-idx="${idx}"]`);
      const statement = card.querySelector('input[type="text"]').value.trim();
      if (!statement) return;

      const outcome = await apiFetch('POST', '/api/outcomes', { statement });
      outcomes.push(outcome);

      // Assign checked todos to this outcome
      const checked = [...card.querySelectorAll('input[type="checkbox"]:checked')];
      for (const cb of checked) {
        const todoId = parseInt(cb.dataset.todoId);
        const todo = todos.find(t => t.id === todoId);
        if (!todo) continue;
        const outcomeIds = [...new Set([...(todo.outcomeIds || []), outcome.id])];
        const updated = await apiFetch('PATCH', `/api/todos/${todoId}`, { outcomeIds });
        todos = todos.map(t => t.id === todoId ? updated : t);
      }

      card.classList.add('dismissed');
      renderOutcomesSummary();
      renderOutcomeSelect();
      renderOutcomesView();
    });
  });

  // Dismiss
  results.querySelectorAll('.suggestion-dismiss-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = btn.dataset.idx;
      results.querySelector(`.analysis-suggestion[data-idx="${idx}"]`).classList.add('dismissed');
    });
  });
}

// ─── Ambient outcome suggestion ───────────────────────────────────────────────

let suggestionDebounce = null;
let pendingSuggestion = null;

document.getElementById('todo-input').addEventListener('input', () => {
  clearTimeout(suggestionDebounce);
  document.getElementById('outcome-suggestion').innerHTML = '';
  pendingSuggestion = null;

  const text = document.getElementById('todo-input').value.trim();
  if (!text || text.length < 10 || outcomes.length === 0) return;

  suggestionDebounce = setTimeout(async () => {
    const data = await apiFetch('POST', '/api/suggest-outcome', { todoText: text });
    if (!data.suggestion) return;

    pendingSuggestion = data.suggestion;
    const el = document.getElementById('outcome-suggestion');
    el.innerHTML = `
      <span>→ Relates to <strong>${escapeHtml(data.suggestion.statement)}</strong></span>
      <button class="outcome-suggestion-assign">Assign</button>
    `;
    el.querySelector('.outcome-suggestion-assign').addEventListener('click', () => {
      document.getElementById('outcome-select').value = data.suggestion.id;
      el.innerHTML = `<span style="color:#16a34a">✓ Assigned to "${escapeHtml(data.suggestion.statement)}"</span>`;
      pendingSuggestion = null;
    });
  }, 600);
});

// ─── Utilities ────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Demo controls ────────────────────────────────────────────────────────────

document.getElementById('reset-btn').addEventListener('click', async () => {
  if (!confirm('Reset to example todos? This will clear all your todos and outcomes.')) return;
  const data = await apiFetch('POST', '/api/reset');
  todos = data.todos;
  outcomes = data.outcomes;
  settings = data.settings;
  renderSettingsPanel();
  renderOutcomesSummary();
  renderOutcomeSelect();
  renderOutcomesView();
});

document.getElementById('clear-btn').addEventListener('click', async () => {
  if (!confirm('Clear everything? All todos and outcomes will be deleted.')) return;
  const data = await apiFetch('POST', '/api/clear');
  todos = data.todos;
  outcomes = data.outcomes;
  settings = data.settings;
  renderSettingsPanel();
  renderOutcomesSummary();
  renderOutcomeSelect();
  renderOutcomesView();
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

loadAll();
