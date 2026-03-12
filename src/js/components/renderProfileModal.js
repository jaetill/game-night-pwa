import { getProfile, saveProfile } from '../auth/profile.js';
import { openImportModal } from './renderImportModal.js';
import { toastSuccess } from '../ui/toast.js';

export function openProfileModal() {
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
}
