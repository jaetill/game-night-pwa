import { syncAndRender } from '../utils/index.js';
import { getCurrentUser } from '../auth/userStore.js';
import { btn, input } from '../ui/elements.js';

export function renderSuggestions(night, nights) {
  const wrapper = document.createElement('div');

  const label = document.createElement('span');
  label.className = 'section-label';
  label.textContent = 'Game Suggestions';
  wrapper.appendChild(label);

  // ── Input row ────────────────────────────────────────────
  const row = document.createElement('div');
  row.className = 'flex gap-2';

  const inputEl = input('Suggest a game…');
  inputEl.className = 'field flex-1';

  const suggestBtn = btn('Suggest', 'secondary');
  suggestBtn.onclick = () => {
    const title = inputEl.value.trim();
    if (!title) return;
    night.suggestions = night.suggestions || [];
    night.suggestions.push({ title, suggestedBy: getCurrentUser()?.name || 'Someone' });
    night.lastModified = Date.now();
    inputEl.value = '';
    syncAndRender(nights);
  };

  // Allow Enter key to submit
  inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') suggestBtn.click(); });

  row.appendChild(inputEl);
  row.appendChild(suggestBtn);
  wrapper.appendChild(row);

  // ── Suggestions list ─────────────────────────────────────
  if (night.suggestions?.length) {
    const list = document.createElement('ul');
    list.className = 'mt-2 space-y-1';
    night.suggestions.forEach(s => {
      const li = document.createElement('li');
      li.className = 'text-sm text-gray-700 flex items-center gap-1';

      const title = document.createElement('span');
      title.textContent = `🎲 ${s.title}`;

      const by = document.createElement('em');
      by.className = 'text-xs text-gray-400 ml-1';
      by.textContent = `by ${s.suggestedBy}`;

      li.appendChild(title);
      li.appendChild(by);
      list.appendChild(li);
    });
    wrapper.appendChild(list);
  }

  return wrapper;
}
