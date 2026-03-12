import { syncAndRender } from '../utils/index.js';
import { btn } from '../ui/elements.js';
import { toastError } from '../ui/toast.js';
import { saveGameNights } from '../data/index.js';

export function renderFood(night, nights, currentUser) {
  if (!night.food) return null;

  const wrapper = document.createElement('div');

  const label = document.createElement('span');
  label.className = 'section-label';
  label.textContent = 'Food';
  wrapper.appendChild(label);

  // Food plan
  const plan = document.createElement('p');
  plan.className = 'text-sm text-gray-700';
  plan.textContent = night.food;
  wrapper.appendChild(plan);

  // Bring your own note
  const note = document.createElement('p');
  note.className = 'text-xs text-gray-400 mt-1';
  note.textContent = 'Feel free to bring your own meal if you prefer — no obligation to eat with the group.';
  wrapper.appendChild(note);

  if (!night.allowSides || !currentUser) return wrapper;

  // ── Sides list ────────────────────────────────────────────
  const sides = night.sides || [];

  if (sides.length > 0) {
    const sidesLabel = document.createElement('p');
    sidesLabel.className = 'text-xs font-semibold text-gray-500 mt-3 mb-1';
    sidesLabel.textContent = 'Bringing a side:';
    wrapper.appendChild(sidesLabel);

    const sidesList = document.createElement('ul');
    sidesList.className = 'space-y-1';
    sides.forEach(s => {
      const li = document.createElement('li');
      li.className = 'text-sm text-gray-700 flex items-center justify-between';
      li.textContent = `${s.name}: ${s.description}`;

      if (s.userId === currentUser.userId) {
        const removeBtn = btn('×', 'ghost');
        removeBtn.className += ' text-xs py-0 px-1.5';
        removeBtn.onclick = async () => {
          night.sides = (night.sides || []).filter(x => x.userId !== currentUser.userId);
          night.lastModified = Date.now();
          try {
            await saveGameNights(nights);
            syncAndRender(nights);
          } catch {
            toastError('Could not update. Try again.');
          }
        };
        li.appendChild(removeBtn);
      }
      sidesList.appendChild(li);
    });
    wrapper.appendChild(sidesList);
  }

  // ── Bring a side input (for RSVPd guests who haven't yet) ─
  const isRSVPd   = night.rsvps?.some(r => r.userId === currentUser.userId);
  const alreadyIn = sides.some(s => s.userId === currentUser.userId);

  if (isRSVPd && !alreadyIn) {
    const inputRow = document.createElement('div');
    inputRow.className = 'flex gap-2 mt-3';

    const sideInput = document.createElement('input');
    sideInput.type = 'text';
    sideInput.placeholder = 'Caesar salad, garlic bread…';
    sideInput.className = 'field flex-1 text-sm';

    const addBtn = btn("I'll bring a side", 'secondary');
    addBtn.className += ' text-xs shrink-0';

    const submit = async () => {
      const desc = sideInput.value.trim();
      if (!desc) return;
      night.sides = night.sides || [];
      night.sides.push({ userId: currentUser.userId, name: currentUser.name || currentUser.userId, description: desc });
      night.lastModified = Date.now();
      sideInput.value = '';
      try {
        await saveGameNights(nights);
        syncAndRender(nights);
      } catch {
        toastError('Could not save. Try again.');
      }
    };

    sideInput.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    addBtn.onclick = submit;

    inputRow.appendChild(sideInput);
    inputRow.appendChild(addBtn);
    wrapper.appendChild(inputRow);
  }

  return wrapper;
}
