import { ownedGames } from '../data/state.js';
import { syncAndRender } from '../utils/index.js';
import { getCurrentUser } from '../auth/userStore.js';
import { isHost } from '../auth/permissions.js';
import { btn, input } from '../ui/elements.js';

export function renderSuggestions(night, nights) {
  const currentUser = getCurrentUser();
  const hasRSVP = night.rsvps?.some(r => r.userId === currentUser?.userId);
  const hostView = isHost(currentUser, night);

  const wrapper = document.createElement('div');

  const hasBringing = night.suggestions?.some(s => typeof s === 'object' && s.willBring !== false);
  if (!hasRSVP && !hostView && !hasBringing) return wrapper;

  const label = document.createElement('span');
  label.className = 'section-label';
  label.textContent = 'Games being brought';
  wrapper.appendChild(label);

  // ── Input (anyone with an RSVP can add) ───────────────────
  if (hasRSVP) {
    const inputWrap = document.createElement('div');
    inputWrap.className = 'relative';

    const inputEl = input("Search or type a game title…");
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

    inputEl.oninput = () => { selectedGame = null; updateDropdown(); };
    inputEl.onfocus = updateDropdown;
    inputEl.onblur  = () => setTimeout(() => dropdown.classList.add('hidden'), 150);

    inputWrap.appendChild(inputEl);
    inputWrap.appendChild(dropdown);

    const submitRow = document.createElement('div');
    submitRow.className = 'flex gap-2 mt-2';

    const bringBtn = btn("I'm bringing this", 'secondary');

    function submit() {
      const title = selectedGame?.title || inputEl.value.trim();
      if (!title) return;

      night.suggestions = night.suggestions || [];
      night.suggestions.push({
        title,
        bggId:             selectedGame?.id       || null,
        thumbnail:         selectedGame?.thumbnail || null,
        suggestedBy:       currentUser?.name       || 'Someone',
        suggestedByUserId: currentUser?.userId     || null,
        willBring:         true,
      });

      night.lastModified = Date.now();
      inputEl.value = '';
      selectedGame  = null;
      syncAndRender(nights);
    }

    inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    bringBtn.onclick = submit;

    submitRow.appendChild(inputWrap);
    submitRow.appendChild(bringBtn);
    wrapper.appendChild(submitRow);
  }

  // ── List of declared games ─────────────────────────────────
  const bringing = (night.suggestions || []).filter(s => typeof s === 'object');
  if (bringing.length) {
    const list = document.createElement('ul');
    list.className = 'mt-3 space-y-2';

    bringing.forEach((s, i) => {
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
      titleEl.className = 'font-medium';
      titleEl.textContent = s.title;
      li.appendChild(titleEl);

      if (s.suggestedBy) {
        const byEl = document.createElement('em');
        byEl.className = 'text-xs text-gray-400';
        byEl.textContent = `— ${s.suggestedBy}`;
        li.appendChild(byEl);
      }

      const canDelete = hostView || (s.suggestedByUserId && s.suggestedByUserId === currentUser?.userId);
      if (canDelete) {
        const delBtn = btn('×', 'ghost');
        delBtn.className += ' text-xs py-0 px-1.5 ml-auto shrink-0';
        delBtn.setAttribute('aria-label', `Remove: ${s.title}`);
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

  // Hide the whole section if there's nothing to show
  if (!hasRSVP && !bringing.length) return document.createElement('div');

  return wrapper;
}
