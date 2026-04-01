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
  const { name, phone, source, assignedTo, remarks } = req.body;

  // Only name is required now
  if (!name) {
    return res.status(400).json({ success: false, message: 'Name is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO leads (name, phone, source, assigned_to, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, phone || '', source || 'manual', assignedTo || null, remarks || '']
    );

    res.json({ success: true, lead: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
// BULK INSERT LEADS
router.post('/bulk', async (req, res) => {
  const { leads } = req.body;

  try {
    for (let lead of leads) {
      await pool.query(
        `INSERT INTO leads (name, phone, source, status, assigned_to, remark)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          lead.name || null,
          lead.phone || null,
          lead.source || null,
          lead.status || null,
          lead.assigned_to ? parseInt(lead.assigned_to) : null,
          lead.remark || null
        ]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});
router.patch('/status/:id', async (req, res) => {
  const leadId = parseInt(req.params.id);
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ success: false, message: 'Status is required' });
  }

  try {
    // Update the status in DB
    const result = await pool.query(
      'UPDATE leads SET status = $1 WHERE id = $2 RETURNING *',
      [status, leadId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    res.json({ success: true, lead: result.rows[0] });
  } catch (err) {
    console.error('Error updating lead status:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;