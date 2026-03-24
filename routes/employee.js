const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');

// -----------------
// SIGNUP
// -----------------
router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;

  try {
    // Check if email exists
    const existing = await pool.query(
      'SELECT * FROM crmemployee WHERE email = $1',
      [email]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert employee with status pending
    const newEmp = await pool.query(
      `INSERT INTO crmemployee (name, email, password, role, status)
       VALUES ($1, $2, $3, 'user', 'pending') RETURNING id, name, email, role, status, created_at`,
      [name, email, hashedPassword]
    );

    res.json({ message: 'Signup successful, wait for admin approval', employee: newEmp.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// -----------------
// LOGIN
// -----------------
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const emp = await pool.query(
      'SELECT * FROM crmemployee WHERE email = $1',
      [email]
    );

    if (emp.rows.length === 0) return res.status(400).json({ message: 'Invalid email' });

    const valid = await bcrypt.compare(password, emp.rows[0].password);
    if (!valid) return res.status(400).json({ message: 'Invalid password' });

    // Check status
    if (emp.rows[0].status === 'pending')
      return res.status(403).json({ message: 'Wait for admin approval' });
    if (emp.rows[0].status === 'rejected')
      return res.status(403).json({ message: 'Your account was rejected by admin' });

    res.json({
      id: emp.rows[0].id,
      name: emp.rows[0].name,
      email: emp.rows[0].email,
      role: emp.rows[0].role,
      status: emp.rows[0].status
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// -----------------
// GET PENDING EMPLOYEES (Admin)
// -----------------
router.get('/pending', async (req, res) => {
  try {
    const pending = await pool.query(
      "SELECT id, name, email, role, status, created_at FROM crmemployee WHERE status = 'pending' ORDER BY created_at DESC"
    );
    res.json(pending.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// -----------------
// APPROVE EMPLOYEE (Admin)
// -----------------
router.put('/:id/approve', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("UPDATE crmemployee SET status='approved' WHERE id=$1", [id]);
    res.json({ message: 'Employee approved' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// -----------------
// REJECT EMPLOYEE (Admin)
// -----------------
router.put('/:id/reject', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("UPDATE crmemployee SET status='rejected' WHERE id=$1", [id]);
    res.json({ message: 'Employee rejected' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;