import { parseBggCollectionXml, saveCollection } from '../data/bgg.js';
import { getCurrentUser } from '../auth/userStore.js';
import { getProfile } from '../auth/profile.js';
import { toastSuccess, toastError } from '../ui/toast.js';

export function openImportModal() {
  const modal = document.getElementById('importModal');
  if (!modal) return;

  const profile     = getProfile();
  const bggUsername = profile.bggUsername || getCurrentUser()?.userId || '';

  // Update the link with the current bgg username
  const link = document.getElementById('importBggLink');
  if (link) {
    link.href        = `https://boardgamegeek.com/xmlapi2/collection?username=${encodeURIComponent(bggUsername)}&own=1&stats=1`;
    link.textContent = link.href;
  }

  const noUsername = document.getElementById('importNoUsername');
  if (noUsername) noUsername.classList.toggle('hidden', !!bggUsername);

  modal.classList.remove('hidden');

  document.getElementById('closeImportModal').onclick = () => {
    modal.classList.add('hidden');
    resetImportModal();
  };

  document.getElementById('importFileInput').onchange = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      document.getElementById('importXmlText').value = ev.target.result;
    };
    reader.readAsText(file);
  };

  document.getElementById('importBtn').onclick = async () => {
    const xml    = document.getElementById('importXmlText').value.trim();
    const status = document.getElementById('importStatus');

    if (!xml) {
      status.textContent = 'Paste your BGG collection XML or upload a file first.';
      status.className = 'text-sm text-red-500 mt-2';
      return;
    }

    const user = getCurrentUser();
    if (!user) {
      status.textContent = 'Not logged in.';
      return;
    }

    status.textContent = 'Parsing…';
    status.className = 'text-sm text-gray-500 mt-2';

    let games;
    try {
      games = parseBggCollectionXml(xml);
    } catch (err) {
      status.textContent = err.message;
      status.className = 'text-sm text-red-500 mt-2';
      return;
    }

    status.textContent = `Saving ${games.length} games…`;

    try {
      await saveCollection(user.userId, games);
      modal.classList.add('hidden');
      resetImportModal();
      toastSuccess(`Imported ${games.length} games from your BGG collection.`);
    } catch (err) {
      status.textContent = `Upload failed: ${err.message}`;
      status.className = 'text-sm text-red-500 mt-2';
      toastError('Could not save collection.');
    }
  };
}

function resetImportModal() {
  const textarea = document.getElementById('importXmlText');
  const status   = document.getElementById('importStatus');
  const fileInput = document.getElementById('importFileInput');
  if (textarea)  textarea.value   = '';
  if (status)    status.textContent = '';
  if (fileInput) fileInput.value   = '';
}
