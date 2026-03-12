import { Amplify, Auth } from 'aws-amplify';
import amplifyConfig from './config.js';

Amplify.configure(amplifyConfig);

const errorEl = document.getElementById('error');

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
}
function clearError() {
  errorEl.textContent = '';
  errorEl.classList.add('hidden');
}
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

let pendingUsername = '';
let pendingPassword = '';

// ── Sign up ───────────────────────────────────────────────────
document.getElementById('signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  const btn         = document.getElementById('signup-btn');
  const displayName = document.getElementById('display-name').value.trim();
  const email       = document.getElementById('email').value.trim().toLowerCase();
  const username    = document.getElementById('username').value.trim();
  const password    = document.getElementById('password').value;

  if (!displayName || !email || !username || !password) {
    showError('Please fill in all fields.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Creating account…';

  try {
    await Auth.signUp({
      username,
      password,
      attributes: {
        email,
        name: displayName,
      },
    });
    pendingUsername = username;
    pendingPassword = password;
    hide('signup-form');
    show('confirm-form');
  } catch (err) {
    showError(err.message || 'Could not create account. Please try again.');
    btn.disabled = false;
    btn.textContent = 'Create account';
  }
});

// ── Confirm ───────────────────────────────────────────────────
document.getElementById('confirm-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  const btn  = document.getElementById('confirm-btn');
  const code = document.getElementById('confirm-code').value.trim();

  btn.disabled = true;
  btn.textContent = 'Confirming…';

  try {
    await Auth.confirmSignUp(pendingUsername, code);
    await Auth.signIn(pendingUsername, pendingPassword);
    window.location.href = 'index.html';
  } catch (err) {
    showError(err.message || 'Invalid code. Please try again.');
    btn.disabled = false;
    btn.textContent = 'Confirm account';
  }
});

// ── Resend code ───────────────────────────────────────────────
document.getElementById('resend-btn').addEventListener('click', async () => {
  clearError();
  try {
    await Auth.resendSignUp(pendingUsername);
    errorEl.textContent = 'Code resent — check your email.';
    errorEl.classList.remove('hidden');
    errorEl.classList.replace('text-red-600', 'text-green-600');
  } catch (err) {
    showError(err.message || 'Could not resend code.');
  }
});
