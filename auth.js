async function postJSON(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return { status: res.status, data: await res.json() };
}

if (document.getElementById('signup-form')) {
  document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const body = {
      username: form.username.value,
      password: form.password.value,
      btc_address: form.btc_address.value
    };
    const result = await postJSON('/api/auth/signup', body);
    if (result.status >= 400) {
      document.getElementById('signup-msg').textContent = result.data.error || 'Signup failed';
      return;
    }
    localStorage.setItem('darepay_token', result.data.token);
    localStorage.setItem('darepay_user', JSON.stringify(result.data.user));
    window.location.href = '/profile.html';
  });
}

if (document.getElementById('login-form')) {
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const body = { username: form.username.value, password: form.password.value };
    const result = await postJSON('/api/auth/login', body);
    if (result.status >= 400) {
      document.getElementById('login-msg').textContent = result.data.error || 'Login failed';
      return;
    }
    localStorage.setItem('darepay_token', result.data.token);
    localStorage.setItem('darepay_user', JSON.stringify(result.data.user));
    window.location.href = '/profile.html';
  });
}
