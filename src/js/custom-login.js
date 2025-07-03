import { Amplify, Auth } from 'aws-amplify';
import amplifyConfig from './config.js';
Amplify.configure(amplifyConfig);

document.getElementById('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const errorDiv = document.getElementById('error');

  try {
    const user = await Auth.signIn(username, password);
    console.log('✅ Logged in as:', user);
    errorDiv.textContent = '';
    window.location.href = 'index.html'; // or wherever you'd like to redirect
  } catch (error) {
    console.error('❌ Login failed:', error);
    errorDiv.textContent = error.message || 'Login failed. Please try again.';
  }
});
