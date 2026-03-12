import { ownedGames } from '../data/state.js';
import { syncAndRender } from '../utils/index.js';
import { getCurrentUser } from '../auth/userStore.js';
import { isHost } from '../auth/permissions.js';
import { btn, input } from '../ui/elements.js';

export function renderSuggestions(night, nights) {
  const currentUserForHost = getCurrentUser();
  const hostView = isHost(currentUserForHost, night);

  const wrapper = document.createElement('div');

  if (hostView && !night.suggestions?.length) return wrapper;

  const label = document.createElement('span');
  label.className = 'section-label';
  label.textContent = 'Game Suggestions';
  wrapper.appendChild(label);

  // ── Search input with live dropdown ────────────────────────
  const inputWrap = document.createElement('div');
  inputWrap.className = 'relative';

  const inputEl = input('Search host\'s games or type a title…');
  inputEl.className = 'field w-full';
  inputEl.autocomplete = 'off';

  const dropdown = document.createElement('ul');
  dropdown.className = [
    'absolute z-10 w-full bg-white border border-gray-200',
    'rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto hidden',
  ].join(' ');

  let selectedGame = null;

  function updateDropdown() {
    const q = inputEl.value.trim().toLowerCase();
    if (!q || ownedGames.length === 0) { dropdown.classList.add('hidden'); return; }

    const matches = ownedGames.filter(g => g.title.toLowerCase().includes(q)).slice(0, 8);
    if (matches.length === 0) { dropdown.classList.add('hidden'); return; }

    dropdown.innerHTML = '';
    matches.forEach(game => {
      const li = document.createElement('li');
      li.className = 'px-3 py-2 text-sm cursor-pointer hover:bg-amber-50 flex items-center gap-2';

      if (game.thumbnail) {
        const img = document.createElement('img');
        img.src = game.thumbnail;
        img.className = 'w-8 h-8 rounded object-cover shrink-0';
        li.appendChild(img);
      }

      const text = document.createElement('span');
      text.textContent = `${game.title} (${game.minPlayers}–${game.maxPlayers})`;
      li.appendChild(text);

      // mousedown fires before blur so we can capture selection before dropdown hides
      li.onmousedown = e => {
        e.preventDefault();
        selectedGame = game;
        inputEl.value = game.title;
        dropdown.classList.add('hidden');
      };

      dropdown.appendChild(li);
    });
    dropdown.classList.remove('hidden');
  }

  inputEl.oninput  = () => { selectedGame = null; updateDropdown(); };
  inputEl.onfocus  = updateDropdown;
  inputEl.onblur   = () => setTimeout(() => dropdown.classList.add('hidden'), 150);

  inputWrap.appendChild(inputEl);
  inputWrap.appendChild(dropdown);

  // ── "I'll bring this" checkbox ─────────────────────────────
  const bringLabel = document.createElement('label');
  bringLabel.className = 'flex items-center gap-2 text-sm text-gray-600 mt-2 cursor-pointer select-none';
  const bringCheck = document.createElement('input');
  bringCheck.type = 'checkbox';
  bringCheck.className = 'rounded accent-amber-500';
  const bringText = document.createElement('span');
  bringText.textContent = "I'll bring this";
  bringLabel.appendChild(bringCheck);
  bringLabel.appendChild(bringText);

  const submitRow = document.createElement('div');
  submitRow.className = 'flex gap-2 mt-2';
  const suggestBtn = btn('Suggest', 'secondary');

  function submit() {
    const title = selectedGame?.title || inputEl.value.trim();
    if (!title) return;

    night.suggestions = night.suggestions || [];
    const me = getCurrentUser();
    night.suggestions.push({
      title,
      bggId:             selectedGame?.id        || null,
      thumbnail:         selectedGame?.thumbnail  || null,
      suggestedBy:       me?.name                || 'Someone',
      suggestedByUserId: me?.userId              || null,
      willBring:         bringCheck.checked,
    });

    night.lastModified = Date.now();
    inputEl.value      = '';
    bringCheck.checked = false;
    selectedGame       = null;
    syncAndRender(nights);
  }

  inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  suggestBtn.onclick = submit;

  if (!hostView) {
    submitRow.appendChild(inputWrap);
    submitRow.appendChild(suggestBtn);
    wrapper.appendChild(submitRow);
    wrapper.appendChild(bringLabel);
  }

  // ── Suggestions list ───────────────────────────────────────
  if (night.suggestions?.length) {
    const currentUser = getCurrentUser();
    const list = document.createElement('ul');
    list.className = 'mt-3 space-y-2';

    night.suggestions.forEach((s, i) => {
      // Normalize old string-based suggestions
      if (typeof s === 'string') s = { title: s, suggestedBy: null };

      const li = document.createElement('li');
      li.className = 'text-sm text-gray-700 flex items-center gap-2';

      if (s.thumbnail) {
        const img = document.createElement('img');
        img.src = s.thumbnail;
        img.className = 'w-8 h-8 rounded object-cover shrink-0';
        li.appendChild(img);
      } else {
        const icon = document.createElement('span');
        icon.textContent = '🎲';
        li.appendChild(icon);
      }

      const titleEl = document.createElement('span');
      titleEl.textContent = s.title;
      li.appendChild(titleEl);

      if (s.suggestedBy) {
        const byEl = document.createElement('em');
        byEl.className = 'text-xs text-gray-400';
        byEl.textContent = `by ${s.suggestedBy}`;
        li.appendChild(byEl);
      }

      if (s.willBring) {
        const badge = document.createElement('span');
        badge.className = 'badge badge-going text-xs ml-auto';
        badge.textContent = '🚗 bringing it';
        li.appendChild(badge);
      }

      // Delete: host can remove anything; suggester can remove their own
      const canDelete = isHost(currentUser, night) ||
                        (s.suggestedByUserId && s.suggestedByUserId === currentUser?.userId);
      if (canDelete) {
        const delBtn = btn('×', 'ghost');
        delBtn.className += ' text-xs py-0 px-1.5 ml-auto shrink-0';
        delBtn.setAttribute('aria-label', `Remove suggestion: ${s.title}`);
        delBtn.onclick = () => {
          night.suggestions.splice(i, 1);
          night.lastModified = Date.now();
          syncAndRender(nights);
        };
        li.appendChild(delBtn);
      }

      list.appendChild(li);
    });

    wrapper.appendChild(list);
  }

  return wrapper;
}
