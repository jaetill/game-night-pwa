// Web Push client — service-worker registration, subscribe/unsubscribe, and
// home-screen badge clearing.
//
// iOS quirk worth knowing (16.4+): push only works when the PWA has been
// added to the Home Screen; Safari-in-a-tab reports 'serviceWorker' but has
// no Notification/PushManager. pushSupported() covers both. And
// Notification.requestPermission() must run inside a user gesture (the
// bell button click) — calling it on load silently returns 'denied'.

import { API_BASE, VAPID_PUBLIC_KEY } from '../config.js';

import { authFetch } from './authFetch.js';

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

// The Push API wants the VAPID key as a Uint8Array, not base64url.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/** 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed' */
export async function getPushState() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 'unsubscribed';
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'subscribed' : 'unsubscribed';
}

/** Must be called from a user gesture (button click). */
export async function subscribeToPush() {
  const reg = (await navigator.serviceWorker.getRegistration()) || (await registerServiceWorker());
  if (!reg) throw new Error('unsupported');
  await navigator.serviceWorker.ready;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('denied');

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  const res = await authFetch(`${API_BASE}/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'subscribe', subscription: sub.toJSON() }),
  });
  if (!res.ok) {
    // Server didn't record it — roll back so state stays consistent.
    await sub.unsubscribe().catch(() => {});
    throw new Error('server');
  }
}

export async function unsubscribeFromPush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (!sub) return;
  await authFetch(`${API_BASE}/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'unsubscribe', endpoint: sub.endpoint }),
  }).catch(() => { /* best-effort: local unsubscribe is what matters */ });
  await sub.unsubscribe();
}

export async function clearBadge() {
  if ('clearAppBadge' in navigator) {
    try { await navigator.clearAppBadge(); } catch { /* unsupported */ }
  }
}
