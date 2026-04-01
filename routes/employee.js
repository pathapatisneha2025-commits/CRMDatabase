const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');

// -----------------
// SIGNUP
// -----------------
router.post('/signup', async (req, res) => {
const { name, email, phone, password, role } = req.body;
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

    // Insert employee with phone and status pending
    const newEmp = await pool.query(
      `INSERT INTO crmemployee (name, email, phone, password, role, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING id, name, email, phone, role, status, created_at`, // added phone
      [name, email, phone, hashedPassword,role] // added phone
    );

    res.json({
      message: 'Signup successful, wait for admin approval',
      employee: newEmp.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// -----------------
// LOGIN
// -----------------
router.post('/login', async (req, res) => {
  let { email, password, role } = req.body;

  try {
    const emp = await pool.query(
      'SELECT * FROM crmemployee WHERE email = $1',
      [email]
    );

    if (emp.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid email' });
    }

    const employee = emp.rows[0];

    // Compare password
    const valid = await bcrypt.compare(password, employee.password);
    if (!valid) {
      return res.status(400).json({ message: 'Invalid password' });
    }

    // Normalize role
    role = role.toLowerCase().trim();
    const dbRole = employee.role.toLowerCase().trim();

    // Check role
    if (dbRole !== role) {
      return res.status(403).json({ message: `You are not registered as ${role}` });
    }

    // Only check status if employee
    if (role === 'employee') {
      if (employee.status === 'pending') {
        return res.status(403).json({ message: 'Wait for admin approval' });
      }
      if (employee.status === 'rejected') {
        return res.status(403).json({ message: 'Your account was rejected by admin' });
      }
    }

  // Success response
const responsePayload = {
  id: employee.id,
  name: employee.name,
  email: employee.email,
  phone: employee.phone,
  role: dbRole, // always lowercase
  status: employee.status,
};

// Log the response
console.log("Login response being sent:", responsePayload);

res.json(responsePayload);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});
router.get('/all', async (req, res) => {
  try {
    const allEmployees = await pool.query(
      "SELECT id, name, email, phone, role, status, created_at FROM crmemployee ORDER BY created_at DESC"
    );
    res.json(allEmployees.rows);
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
      "SELECT id, name, email, phone, role, status, created_at FROM crmemployee WHERE status = 'pending' ORDER BY created_at DESC" // added phone
    );
    res.json(pending.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// -----------------
// UPDATE EMPLOYEE STATUS (Admin)
// -----------------
router.put('/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // expected: 'approved' or 'rejected'

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: "Invalid status. Use 'approved' or 'rejected'." });
  }

  try {
    const result = await pool.query(
      "UPDATE crmemployee SET status=$1 WHERE id=$2 RETURNING id, name, email, phone, role, status", // added phone
      [status, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    res.json({ message: `Employee ${status}`, employee: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});



// GET /api/employee-performance
router.get("/employee-performance", async (req, res) => {
  try {
    const query = `
      SELECT 
        e.id AS employee_id,
        e.name AS employee_name,
        COUNT(l.id) AS total_leads,
        COUNT(CASE WHEN l.status = 'Converted' THEN 1 END) AS converted,
        COUNT(CASE WHEN l.status != 'Converted' AND l.status != 'Not Interested' THEN 1 END) AS pending
      FROM crmemployee e
      LEFT JOIN leads l ON l.assigned_to = e.id
      WHERE e.status = 'approved'
      GROUP BY e.id, e.name
      ORDER BY e.name
    `;

    const result = await pool.query(query);

    // Return structured response
    res.json(result.rows.map(row => ({
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      total_leads: Number(row.total_leads),
      converted: Number(row.converted),
      pending: Number(row.pending),
      conversion_rate: row.total_leads > 0 
        ? Math.round((row.converted / row.total_leads) * 100) 
        : 0
    })));

  } catch (err) {
    console.error("Employee performance error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});



module.exports = router;