import { getProfile, saveProfile } from '../auth/profile.js';
import { getGroups, loadGroups, saveGroup, deleteGroup } from '../auth/groups.js';
import { openImportModal } from './renderImportModal.js';
import { toastSuccess, toastError } from '../ui/toast.js';

export async function openProfileModal() {
  const modal = document.getElementById('profileModal');
  if (!modal) return;

  const profile = getProfile();
  document.getElementById('profileDisplayName').value  = profile.displayName  || '';
  document.getElementById('profileBggUsername').value  = profile.bggUsername  || '';
  document.getElementById('profileContactEmail').value = profile.contactEmail || '';
  document.getElementById('profilePhone').value        = profile.phone        || '';
  document.getElementById('profileAddress').value      = profile.address      || '';

  modal.classList.remove('hidden');

  document.getElementById('saveProfile').onclick = async () => {
    await saveProfile({
      displayName:  document.getElementById('profileDisplayName').value.trim(),
      bggUsername:  document.getElementById('profileBggUsername').value.trim(),
      contactEmail: document.getElementById('profileContactEmail').value.trim(),
      phone:        document.getElementById('profilePhone').value.trim(),
      address:      document.getElementById('profileAddress').value.trim(),
    });
    modal.classList.add('hidden');
    toastSuccess('Profile saved.');
  };

  document.getElementById('closeProfileModal').onclick = () => {
    modal.classList.add('hidden');
  };

  document.getElementById('openImportModal').onclick = () => {
    modal.classList.add('hidden');
    openImportModal();
  };

  // ── Groups section ────────────────────────────────────────
  renderGroupsList(getGroups()); // show cached immediately
  loadGroups().then(groups => renderGroupsList(groups)).catch(() => {});

  setupGroupEditForm();
}

// ── Groups list rendering ─────────────────────────────────

function renderGroupsList(groups) {
  const list = document.getElementById('profileGroupsList');
  if (!list) return;
  list.innerHTML = '';

  if (groups.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-xs text-gray-400 italic';
    empty.textContent = 'No groups yet.';
    list.appendChild(empty);
    return;
  }

  groups.forEach(group => {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200';

    const info = document.createElement('div');
    info.className = 'min-w-0';

    const name = document.createElement('span');
    name.className = 'text-sm font-medium text-gray-800 block truncate';
    name.textContent = group.name;

    const count = document.createElement('span');
    count.className = 'text-xs text-gray-400';
    count.textContent = `${group.emails.length} ${group.emails.length === 1 ? 'person' : 'people'}`;

    info.appendChild(name);
    info.appendChild(count);

    const actions = document.createElement('div');
    actions.className = 'flex gap-1 shrink-0';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.className = 'text-xs text-amber-700 hover:underline px-1';
    editBtn.onclick = () => openGroupEditForm(group.name, group.emails);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = 'Delete';
    delBtn.className = 'text-xs text-red-500 hover:underline px-1';
    delBtn.onclick = async () => {
      if (!confirm(`Delete group "${group.name}"?`)) return;
      try {
        const updated = await deleteGroup(group.name);
        renderGroupsList(updated);
        toastSuccess(`"${group.name}" deleted.`);
      } catch (e) {
        toastError('Could not delete group.');
      }
    };

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    row.appendChild(info);
    row.appendChild(actions);
    list.appendChild(row);
  });
}

// ── Group edit form ───────────────────────────────────────

function setupGroupEditForm() {
  const addBtn    = document.getElementById('addGroupBtn');
  const cancelBtn = document.getElementById('cancelGroupBtn');
  const saveBtn   = document.getElementById('saveGroupBtn');

  if (!addBtn) return;

  addBtn.onclick = () => openGroupEditForm('', []);

  cancelBtn.onclick = () => closeGroupEditForm();

  saveBtn.onclick = async () => {
    const nameVal   = document.getElementById('groupNameInput').value.trim();
    const emailsRaw = document.getElementById('groupEmailsInput').value;
    const emails    = emailsRaw
      .split('\n')
      .map(e => e.trim().toLowerCase())
      .filter(e => e.includes('@'));

    if (!nameVal) {
      toastError('Group name is required.');
      return;
    }

    saveBtn.disabled = true;
    try {
      const updated = await saveGroup(nameVal, emails);
      renderGroupsList(updated);
      closeGroupEditForm();
      toastSuccess(`Group "${nameVal}" saved.`);
    } catch (e) {
      toastError('Could not save group.');
    } finally {
      saveBtn.disabled = false;
    }
  };
}

function openGroupEditForm(name, emails) {
  document.getElementById('groupNameInput').value   = name;
  document.getElementById('groupEmailsInput').value = emails.join('\n');
  document.getElementById('groupEditForm').classList.remove('hidden');
  document.getElementById('addGroupBtn').classList.add('hidden');
  document.getElementById('groupNameInput').focus();
}

function closeGroupEditForm() {
  document.getElementById('groupEditForm').classList.add('hidden');
  document.getElementById('addGroupBtn').classList.remove('hidden');
  document.getElementById('groupNameInput').value   = '';
  document.getElementById('groupEmailsInput').value = '';
}
