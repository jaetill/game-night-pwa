const domain = 'us-east-2xneejzadj.auth.us-east-2.amazoncognito.com';
const clientId = '34et7dk67ngqep1oqef49te0ic';
const redirectUri = encodeURIComponent('https://jaetill.github.io/game-night-pwa/login.html');
const scope = encodeURIComponent('openid email profile');
const state = encodeURIComponent('launch');

// Generate a PKCE code verifier and challenge
const codeVerifier = crypto.randomUUID();
const encoder = new TextEncoder();
const data = encoder.encode(codeVerifier);
const hashBuffer = await crypto.subtle.digest('SHA-256', data);
const hashArray = Array.from(new Uint8Array(hashBuffer));
const base64Url = btoa(String.fromCharCode(...hashArray))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Store the verifier for token exchange
sessionStorage.setItem('pkce_code_verifier', codeVerifier);

// Build the login URL manually
const loginUrl = `https://${domain}/oauth2/authorize?` +
  `client_id=${clientId}` +
  `&redirect_uri=${redirectUri}` +
  `&response_type=code` +
  `&scope=${scope}` +
  `&state=${state}` +
  `&code_challenge=${base64Url}` +
  `&code_challenge_method=S256`;

console.log('🔗 Redirecting to:', loginUrl);
window.location.href = loginUrl;
