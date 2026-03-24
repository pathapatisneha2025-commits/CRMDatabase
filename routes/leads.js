const express = require('express');
const router = express.Router();
const pool = require('../db'); // PostgreSQL pool connection

// -----------------
// GET ALL LEADS
// -----------------
router.get('/all', async (req, res) => {
  try {
    const leads = await pool.query('SELECT * FROM leads ORDER BY id DESC');
    res.json({ success: true, leads: leads.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// -----------------
// CREATE LEAD
// -----------------
router.post('/add', async (req, res) => {
  const { name, email, phone, source, assignedTo } = req.body;

  if (!name || !email) {
    return res.status(400).json({ success: false, message: 'Name and email are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO leads (name, email, phone, source, assigned_to)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, email, phone || '', source || 'manual', assignedTo || null]
    );

    res.json({ success: true, lead: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;