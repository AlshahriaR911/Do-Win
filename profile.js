const token = localStorage.getItem('darepay_token');
if (!token) {
  window.location.href = '/login.html';
}

const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

function showMessage(selector, text, danger = false) {
  const el = document.getElementById(selector);
  el.textContent = text;
  el.style.color = danger ? 'red' : 'green';
  setTimeout(() => { el.textContent = ''; }, 4500);
}

async function fetchProfile() {
  const res = await fetch('/api/profile', { headers: authHeaders });
  if (!res.ok) {
    localStorage.removeItem('darepay_token');
    window.location.href = '/login.html';
    return;
  }
  const data = await res.json();
  const user = data.user;
  document.getElementById('user-info').innerHTML = `Username: ${user.username} <br/> BTC: ${user.btc_address || '(not set)'} <br/> balance: ${user.wallet_balance_btc} BTC`;

  const profileForm = document.getElementById('update-profile-form');
  if (profileForm) {
    profileForm.username.value = user.username;
    profileForm.btc_address.value = user.btc_address || '';
  }
  localStorage.setItem('darepay_user', JSON.stringify(user));
}

async function loadDares() {
  const res = await fetch('/api/dares');
  const data = await res.json();
  const container = document.getElementById('dare-table');
  if (!data.dares) return;
  container.innerHTML = '<table><thead><tr><th>Title</th><th>Description</th><th>Reward</th><th>Status</th><th>Creator</th><th>Action</th></tr></thead><tbody>' + data.dares.map(d => {
    const action = d.status === 'accepted' && d.accepted_by && d.accepted_by === JSON.parse(atob(token.split('.')[1])).id
      ? `<button data-id="${d.id}" class="reply-btn">Reply</button>`
      : '-';
    return `<tr><td>${d.title}</td><td>${d.description}</td><td>${d.reward_btc}</td><td>${d.status}</td><td>${d.creator_username}</td><td>${action}</td></tr>`;
  }).join('') + '</tbody></table>';
  document.querySelectorAll('.reply-btn').forEach(btn => {
    btn.addEventListener('click', () => promptReply(btn.dataset.id));
  });
}

async function loadTransactions() {
  const res = await fetch('/api/transactions', { headers: authHeaders });
  const data = await res.json();
  const container = document.getElementById('tx-table');
  if (!data.transactions) return;
  container.innerHTML = '<ul>' + data.transactions.map(tx => `<li>${tx.created_at}: ${tx.type} ${tx.amount_btc} BTC from ${tx.from_username || 'SYSTEM'} to ${tx.to_username || 'ESCROW'} (${tx.note || ''})</li>`).join('') + '</ul>';
}

async function loadReplies() {
  const resAll = await fetch('/api/dares');
  const dares = (await resAll.json()).dares || [];
  const openDareId = dares.length > 0 ? dares[0].id : null;

  const container = document.getElementById('replies-list');
  if (!openDareId) {
    container.textContent = 'No dares found';
    return;
  }
  const res = await fetch(`/api/dare/${openDareId}/replies`);
  const data = await res.json();
  container.innerHTML = '<h4>Replies for Dare #' + openDareId + '</h4>' + (data.replies.length > 0 ? '<ul>' + data.replies.map(r => `<li>${r.responder_username}: ${r.response_text} (${r.created_at})</li>`).join('') + '</ul>' : '<p>No replies yet</p>');
}

async function promptReply(dareId) {
  const text = prompt('Write your reply for the dare');
  if (!text) return;
  const r = await fetch(`/api/dares/${dareId}/reply`, {
    method: 'POST', headers: authHeaders, body: JSON.stringify({ response_text: text })
  });
  const data = await r.json();
  if (!r.ok) return showMessage('dare-msg', data.error || 'Reply failed', true);
  showMessage('dare-msg', 'Reply submitted; reward paid if path valid.');
  loadDares();
  loadTransactions();
  loadReplies();
}

window.addEventListener('DOMContentLoaded', () => {
  fetchProfile();
  loadDares();
  loadTransactions();
  loadReplies();

  document.getElementById('logout-link').addEventListener('click', () => {
    localStorage.removeItem('darepay_token');
    localStorage.removeItem('darepay_user');
  });

  document.getElementById('update-profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { username: e.target.username.value, btc_address: e.target.btc_address.value };
    const res = await fetch('/api/profile', { method: 'PUT', headers: authHeaders, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) return showMessage('wallet-msg', data.error || 'Update failed', true);
    localStorage.setItem('darepay_user', JSON.stringify(data.user));
    showMessage('wallet-msg', 'Profile updated');
    fetchProfile();
  });

  document.getElementById('deposit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = e.target.amount_btc.value;
    const res = await fetch('/api/wallet/deposit', { method: 'POST', headers: authHeaders, body: JSON.stringify({ amount_btc: amount }) });
    const data = await res.json();
    if (!res.ok) return showMessage('wallet-msg', data.error || 'Deposit failed', true);
    showMessage('wallet-msg', `Deposited ${amount} BTC`);
    fetchProfile();
    loadTransactions();
  });

  document.getElementById('transfer-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = { to_username: e.target.to_username.value, amount_btc: e.target.amount_btc.value };
    const res = await fetch('/api/wallet/send', { method: 'POST', headers: authHeaders, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) return showMessage('wallet-msg', data.error || 'Transfer failed', true);
    showMessage('wallet-msg', `Sent ${body.amount_btc} BTC to ${body.to_username}`);
    fetchProfile();
    loadTransactions();
  });

  document.getElementById('dare-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = { title: e.target.title.value, description: e.target.description.value, reward_btc: e.target.reward_btc.value };
    const res = await fetch('/api/dares', { method: 'POST', headers: authHeaders, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) return showMessage('dare-msg', data.error || 'Dare post failed', true);
    showMessage('dare-msg', 'Dare posted successfully');
    e.target.reset();
    loadDares();
    loadTransactions();
  });
});
