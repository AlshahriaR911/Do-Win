require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'secret-change-me';

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function genToken(user) {
  const payload = { id: user.id, username: user.username };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.slice(7);
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    req.user = decoded;
    next();
  });
}

app.post('/api/auth/signup', async (req, res) => {
  const { username, password, btc_address } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const hash = await bcrypt.hash(password, 10);
  db.run('INSERT INTO users (username, password_hash, btc_address) VALUES (?, ?, ?)', [username, hash, btc_address || ''], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username already exists' });
      return res.status(500).json({ error: 'Database error' });
    }
    const token = genToken({ id: this.lastID, username });
    res.json({ token, user: { id: this.lastID, username, btc_address: btc_address || '', wallet_balance_btc: 0 } });
  });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Invalid credentials' });
    const token = genToken(user);
    res.json({ token, user: { id: user.id, username: user.username, btc_address: user.btc_address, wallet_balance_btc: user.wallet_balance_btc } });
  });
});

app.get('/api/profile', authMiddleware, (req, res) => {
  db.get('SELECT id, username, btc_address, wallet_balance_btc FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  });
});

app.put('/api/profile', authMiddleware, (req, res) => {
  const { username, btc_address } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });

  db.run('UPDATE users SET username = ?, btc_address = ? WHERE id = ?', [username, btc_address || '', req.user.id], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username already exists' });
      return res.status(500).json({ error: 'Database error' });
    }
    db.get('SELECT id, username, btc_address, wallet_balance_btc FROM users WHERE id = ?', [req.user.id], (err2, user) => {
      if (err2) return res.status(500).json({ error: 'Database error' });
      res.json({ user });
    });
  });
});

app.post('/api/wallet/deposit', authMiddleware, (req, res) => {
  const { amount_btc } = req.body;
  const amount = Number(amount_btc);
  if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

  db.run('UPDATE users SET wallet_balance_btc = wallet_balance_btc + ? WHERE id = ?', [amount, req.user.id], function (err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    db.run('INSERT INTO transactions (from_user_id, to_user_id, amount_btc, type, note) VALUES (NULL, ?, ?, ?, ?)', [req.user.id, amount, 'deposit', 'BTC deposit to platform wallet']);
    res.json({ success: true, amount_btc: amount });
  });
});

app.post('/api/wallet/send', authMiddleware, (req, res) => {
  const { to_username, amount_btc } = req.body;
  const amount = Number(amount_btc);
  if (!to_username || isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'to_username and positive amount required' });

  db.get('SELECT * FROM users WHERE username = ?', [to_username], (err, recipient) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!recipient) return res.status(404).json({ error: 'Recipient not found' });

    db.get('SELECT wallet_balance_btc FROM users WHERE id = ?', [req.user.id], (err2, sender) => {
      if (err2) return res.status(500).json({ error: 'Database error' });
      if (!sender || sender.wallet_balance_btc < amount) return res.status(400).json({ error: 'Insufficient balance' });

      db.run('UPDATE users SET wallet_balance_btc = wallet_balance_btc - ? WHERE id = ?', [amount, req.user.id]);
      db.run('UPDATE users SET wallet_balance_btc = wallet_balance_btc + ? WHERE id = ?', [amount, recipient.id]);
      db.run('INSERT INTO transactions (from_user_id, to_user_id, amount_btc, type, note) VALUES (?, ?, ?, ?, ?)', [req.user.id, recipient.id, amount, 'transfer', 'User wallet transfer']);
      res.json({ success: true, to: recipient.username, amount_btc: amount });
    });
  });
});

app.get('/api/dares', (req, res) => {
  db.all(`SELECT d.id, d.title, d.description, d.reward_btc, d.status, d.created_at, d.creator_id, u.username as creator_username, d.accepted_by
          FROM dares d
          JOIN users u ON u.id = d.creator_id
          ORDER BY d.created_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ dares: rows });
  });
});

app.post('/api/dares', authMiddleware, (req, res) => {
  const { title, description, reward_btc } = req.body;
  const reward = Number(reward_btc);
  if (!title || !description || isNaN(reward) || reward <= 0) return res.status(400).json({ error: 'Title/description/reward required' });

  db.get('SELECT wallet_balance_btc FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!user || user.wallet_balance_btc < reward) return res.status(400).json({ error: 'Insufficient funds to post dare' });

    db.run('UPDATE users SET wallet_balance_btc = wallet_balance_btc - ? WHERE id = ?', [reward, req.user.id]);
    db.run('INSERT INTO dares (creator_id, title, description, reward_btc) VALUES (?, ?, ?, ?)', [req.user.id, title, description, reward], function (err2) {
      if (err2) return res.status(500).json({ error: 'Database error' });
      db.run('INSERT INTO transactions (from_user_id, to_user_id, amount_btc, type, note) VALUES (?, NULL, ?, ?, ?)', [req.user.id, reward, 'dare_post', `Deposit reward for dare ${this.lastID}`]);
      res.json({ success: true, dare_id: this.lastID });
    });
  });
});

app.post('/api/dares/:id/accept', authMiddleware, (req, res) => {
  const dareId = Number(req.params.id);
  if (isNaN(dareId)) return res.status(400).json({ error: 'Invalid dare id' });

  db.get('SELECT * FROM dares WHERE id = ?', [dareId], (err, dare) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!dare) return res.status(404).json({ error: 'Dare not found' });
    if (dare.creator_id === req.user.id) return res.status(403).json({ error: 'Creator cannot accept own dare' });
    if (dare.status !== 'open') return res.status(400).json({ error: 'Dare already accepted or completed' });

    db.run('UPDATE dares SET status = ?, accepted_by = ? WHERE id = ?', ['accepted', req.user.id, dareId], function (err2) {
      if (err2) return res.status(500).json({ error: 'Database error' });
      res.json({ success: true, accepted_by: req.user.id });
    });
  });
});

app.post('/api/dares/:id/reply', authMiddleware, (req, res) => {
  const dareId = Number(req.params.id);
  const { response_text } = req.body;
  if (isNaN(dareId) || !response_text) return res.status(400).json({ error: 'Invalid payload' });

  db.get('SELECT * FROM dares WHERE id = ?', [dareId], (err, dare) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!dare) return res.status(404).json({ error: 'Dare not found' });
    if (dare.status !== 'accepted' || dare.accepted_by !== req.user.id) return res.status(400).json({ error: 'You must accept the dare first and dare must be open' });

    db.run('INSERT INTO dare_responses (dare_id, responder_id, response_text) VALUES (?, ?, ?)', [dareId, req.user.id, response_text], function (err2) {
      if (err2) return res.status(500).json({ error: 'Database error' });

      db.get('SELECT reward_btc, creator_id FROM dares WHERE id = ?', [dareId], (err3, d) => {
        if (err3) return res.status(500).json({ error: 'Database error' });
        db.run('UPDATE dares SET status = ? WHERE id = ?', ['completed', dareId]);
        db.run('UPDATE users SET wallet_balance_btc = wallet_balance_btc + ? WHERE id = ?', [d.reward_btc, req.user.id]);
        db.run('INSERT INTO transactions (from_user_id, to_user_id, amount_btc, type, note) VALUES (?, ?, ?, ?, ?)', [d.creator_id, req.user.id, d.reward_btc, 'dare_payout', `Payout for dare ${dareId}`]);

        res.json({ success: true, response_id: this.lastID });
      });
    });
  });
});

app.get('/api/transactions', authMiddleware, (req, res) => {
  db.all(`SELECT t.*, u1.username as from_username, u2.username as to_username
          FROM transactions t
          LEFT JOIN users u1 ON u1.id = t.from_user_id
          LEFT JOIN users u2 ON u2.id = t.to_user_id
          WHERE t.from_user_id = ? OR t.to_user_id = ?
          ORDER BY t.created_at DESC`, [req.user.id, req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ transactions: rows });
  });
});

app.get('/api/dare/:id/replies', (req, res) => {
  const dareId = Number(req.params.id);
  db.all(`SELECT r.*, u.username as responder_username FROM dare_responses r JOIN users u ON u.id = r.responder_id WHERE r.dare_id = ? ORDER BY r.created_at DESC`, [dareId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ replies: rows });
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
