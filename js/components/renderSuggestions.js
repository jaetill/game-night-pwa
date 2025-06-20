import { syncAndRender } from '../utils/sync.js';
import { currentUser } from '../data/state.js';


export function renderSuggestions(night, nights) {
  const wrapper = document.createElement('div');

  // 📝 Input for suggesting a game
  const input = document.createElement('input');
  input.placeholder = 'Suggest a game';
  input.style.marginRight = '0.5em';

  const suggestBtn = document.createElement('button');
  suggestBtn.textContent = 'Suggest';

  suggestBtn.onclick = () => {
    const title = input.value.trim();
    if (title) {
      night.suggestions = night.suggestions || [];
      night.suggestions.push({ title, suggestedBy: currentUser.name });
      syncAndRender(nights);
    }
  };

  wrapper.appendChild(document.createElement('br'));
  wrapper.appendChild(input);
  wrapper.appendChild(suggestBtn);

  // 📃 Show existing suggestions
  if (night.suggestions?.length) {
    const list = document.createElement('ul');
    night.suggestions.forEach(s =>
      list.innerHTML += `<li>🎲 ${s.title} <em>(suggested by ${s.suggestedBy})</em></li>`
    );
    wrapper.appendChild(list);
  }

  return wrapper;
}
