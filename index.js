async function fetchDares() {
  const res = await fetch('/api/dares');
  const data = await res.json();
  const container = document.getElementById('dare-list');
  container.innerHTML = '';
  if (!data.dares || data.dares.length === 0) {
    container.innerHTML = '<p>No dares yet.</p>';
    return;
  }

  data.dares.forEach((dare) => {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <h3>${dare.title}</h3>
      <p>${dare.description}</p>
      <p><strong>Reward:</strong> ${dare.reward_btc} BTC</p>
      <p><strong>Status:</strong> ${dare.status}</p>
      <p><strong>Creator:</strong> ${dare.creator_username}</p>
      <p><strong>Created:</strong> ${new Date(dare.created_at).toLocaleString()}</p>
      <button data-id="${dare.id}" class="accept-btn" ${dare.status !== 'open' ? 'disabled' : ''}>Accept</button>
      <a href="/profile.html#dare-${dare.id}">Go to profile to reply</a>
    `;
    container.appendChild(card);
  });

  document.querySelectorAll('.accept-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const token = localStorage.getItem('darepay_token');
      if (!token) return alert('Login required');

      const response = await fetch(`/api/dares/${id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      });
      const result = await response.json();
      if (!response.ok) return alert(result.error || 'Accept failed');
      alert('Dare accepted. Go to Profile to reply.');
      fetchDares();
    });
  });
}

window.addEventListener('DOMContentLoaded', fetchDares);
