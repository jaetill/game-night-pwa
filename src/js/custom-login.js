import { Amplify, Auth } from 'aws-amplify';

Amplify.configure({
  Auth: {
    region: 'us-east-2',
    userPoolId: 'us-east-2_xneeJzaDJ',
    userPoolWebClientId: '34et7dk67ngqep1oqef49te0ic',
  }
});

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
