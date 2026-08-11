// Bell toggle for Web Push notifications — rendered next to the section
// heading. Shows only when the browser supports push (on iOS that means
// the PWA is installed to the Home Screen; in a Safari tab the button
// simply doesn't appear).

import { pushSupported, getPushState, subscribeToPush, unsubscribeFromPush } from '../utils/push.js';
import { toastSuccess, toastError, toastInfo } from '../ui/toast.js';

const LABELS = {
  subscribed:   '🔔 Notifications on',
  unsubscribed: '🔕 Notifications off',
  denied:       '🔕 Notifications blocked',
};

export function renderNotifyToggle() {
  if (!pushSupported()) return null;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'notifyToggle';
  btn.className = 'text-xs px-2 py-1 rounded-full border border-gray-300 text-gray-500 hover:bg-gray-100';
  btn.textContent = '🔔 …';

  let state = 'unsubscribed';

  async function refresh() {
    state = await getPushState();
    btn.textContent = LABELS[state] || LABELS.unsubscribed;
    btn.disabled = state === 'denied';
    btn.title = state === 'denied'
      ? 'Notifications are blocked for this app in your device settings.'
      : 'Get notified when someone RSVPs to your game nights.';
  }

  btn.onclick = async () => {
    btn.disabled = true;
    try {
      if (state === 'subscribed') {
        await unsubscribeFromPush();
        toastInfo('Notifications turned off.');
      } else {
        await subscribeToPush();
        toastSuccess("You'll get a notification when someone RSVPs.");
      }
    } catch (err) {
      if (err?.message === 'denied') {
        toastError('Notifications are blocked — allow them in Settings to turn this on.');
      } else {
        toastError('Could not update notifications. Try again.');
      }
    } finally {
      btn.disabled = false;
      refresh();
    }
  };

  refresh();
  return btn;
}
