const express = require('express');
const router = express.Router();
const pool = require('../db'); // PostgreSQL pool connection
const twilio = require("twilio");

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
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

router.post("/send-bulkwhatsapp", async (req, res) => {
  const { leadIds, template } = req.body;

  try {
    // Get leads from DB
    const leadsQuery = await pool.query(
      "SELECT id, name, phone FROM leads WHERE id = ANY($1::int[])",
      [leadIds.map(id => parseInt(id))]
    );

    for (let lead of leadsQuery.rows) {
      let message = "";

      // Map template to message content
      if (template === "Welcome Template") message = `Hello ${lead.name}, welcome!`;
      if (template === "Follow-up Template") message = `Hi ${lead.name}, following up with you.`;
      if (template === "Promo Template") message = `Hello ${lead.name}, check our promo!`;
      if (template === "Reminder Template") message = `Hi ${lead.name}, just a reminder.`;

      // Send WhatsApp message via Twilio
      await client.messages.create({
        from: whatsappFrom,
        to: `whatsapp:${lead.phone}`,
        body: message,
      });

      // Save to message history
      await pool.query(
        "INSERT INTO whatsapp_messages (lead_id, template, status, sent_at) VALUES ($1,$2,$3,NOW())",
        [lead.id, template, "Sent"]
      );
    }

    res.json({ success: true, message: "Messages sent!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Failed to send messages" });
  }
});
// GET all WhatsApp messages
router.get("/whatsapp-messages", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT wm.id, wm.lead_id, l.name as lead_name, l.phone, wm.template, wm.status, wm.sent_at
      FROM whatsapp_messages wm
      JOIN leads l ON l.id = wm.lead_id
      ORDER BY wm.sent_at DESC
      LIMIT 100
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching WhatsApp messages:", err);
    res.status(500).json({ success: false, error: "Failed to fetch WhatsApp messages" });
  }
});
// BULK INSERT LEADS
router.post('/bulk', async (req, res) => {
  const { leads } = req.body;

  try {
    for (let lead of leads) {
      await pool.query(
        `INSERT INTO leads (name, phone, source, status, assigned_to, notes)
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
router.post("/bulk-assign", async (req, res) => {
  const { leadIds, employeeId } = req.body;

  if (!Array.isArray(leadIds) || leadIds.length === 0 || employeeId == null) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  // Convert IDs to integers
  const validIds = leadIds.map(id => parseInt(id)).filter(id => !isNaN(id));
  const empId = parseInt(employeeId);

  try {
    const query = `
      UPDATE leads
      SET assigned_to = $1
      WHERE id = ANY($2::int[])
      RETURNING id, assigned_to
    `;

    const values = [empId, validIds];
    const result = await pool.query(query, values);

    res.json({ success: true, updated: result.rowCount, leads: result.rows });
  } catch (err) {
    console.error("Bulk assign error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
// -----------------
// UPDATE LEAD (status + remarks)
// -----------------
router.put('/update/:id', async (req, res) => {
  const leadId = parseInt(req.params.id);
  const { status, remark } = req.body; // match frontend keys

  if (!status && !remark) {
    return res.status(400).json({ success: false, message: 'Status or remark is required' });
  }

  try {
    // Update the lead in DB
    const result = await pool.query(
      `UPDATE leads
       SET status = COALESCE($1, status),
           notes = COALESCE($2, notes)
       WHERE id = $3
       RETURNING *`,
      [status || null, remark || null, leadId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    res.json({ success: true, lead: result.rows[0] });
  } catch (err) {
    console.error('Error updating lead:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
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

router.get('/by-employee/:id', async (req, res) => {
  const empId = parseInt(req.params.id);

  try {
    const result = await pool.query(
      `SELECT * FROM leads
       WHERE assigned_to = $1
       ORDER BY created_date DESC`,
      [empId]
    );

    res.json({
      success: true,
      leads: result.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;