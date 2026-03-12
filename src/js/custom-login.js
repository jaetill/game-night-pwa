import { Amplify, Auth } from 'aws-amplify';
import amplifyConfig from './config.js';

Amplify.configure(amplifyConfig);

const form    = document.getElementById('login-form');
const submitBtn = document.getElementById('login-btn');
const errorEl = document.getElementById('error');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in…';
  errorEl.classList.add('hidden');
  errorEl.textContent = '';

  try {
    await Auth.signIn(username, password);
    window.location.href = 'index.html';
  } catch (err) {
    errorEl.textContent = err.message || 'Sign in failed. Please try again.';
    errorEl.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In';
  }
});
