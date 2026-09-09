const express = require('express');
const router = require('express').Router();
const path = require('path');
const { Op } = require('sequelize');
const MessageLog = require('../models/MessageLog');
const Doctor = require('../models/Doctor');

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'Digi@2026';

const sessions = new Set();

function auth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (sessions.has(token)) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

router.use(express.static(path.join(__dirname, 'views')));

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessions.add(token);
    return res.json({ token });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});

router.post('/logout', auth, (req, res) => {
  sessions.delete(req.headers['x-admin-token']);
  res.json({ success: true });
});

router.get('/stats', auth, async (req, res) => {
  try {
    const where = buildWhere(req.query);
    const [total, sent, delivered, read, failed] = await Promise.all([
      MessageLog.count({ where }),
      MessageLog.count({ where: { ...where, status: 'sent' } }),
      MessageLog.count({ where: { ...where, status: 'delivered' } }),
      MessageLog.count({ where: { ...where, status: 'read' } }),
      MessageLog.count({ where: { ...where, status: 'failed' } }),
    ]);

    const types = ['birthday', 'anniversary', 'clinic_anniversary'];
    const byType = {};
    for (const t of types) {
      byType[t] = {
        total: await MessageLog.count({ where: { ...where, message_type: t } }),
        sent: await MessageLog.count({ where: { ...where, message_type: t, status: 'sent' } }),
        delivered: await MessageLog.count({ where: { ...where, message_type: t, status: 'delivered' } }),
        read: await MessageLog.count({ where: { ...where, message_type: t, status: 'read' } }),
        failed: await MessageLog.count({ where: { ...where, message_type: t, status: 'failed' } }),
      };
    }

    res.json({ total, sent, delivered, read, failed, byType });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Safe columns only — excludes columns that may not exist in older DB tables
const SAFE_ATTRS = [
  'id', 'message_id', 'doctor_id', 'doctor_name', 'doctor_phone',
  'doctor_birthday', 'doctor_anniversary', 'doctor_clinic_anniversary',
  'message_type', 'template_name', 'recipient_id', 'status',
  'billable', 'category', 'timestamp',
  'error_code', 'error_title', 'error_message', 'error_details',
  'createdAt', 'updatedAt',
];

router.get('/messages', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const where = buildWhere(req.query);

    const { count, rows } = await MessageLog.findAndCountAll({
      where,
      attributes: SAFE_ATTRS,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    res.json({ total: count, page, limit, pages: Math.ceil(count / limit), data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/export', auth, async (req, res) => {
  try {
    const where = buildWhere(req.query);
    const rows = await MessageLog.findAll({
      where,
      attributes: SAFE_ATTRS,
      order: [['createdAt', 'DESC']],
    });
    const format = req.query.format || 'csv';
    const fields = SAFE_ATTRS;

    if (format === 'csv') {
      const csv = [fields.join(','), ...rows.map(r =>
        fields.map(f => JSON.stringify(r[f] ?? '')).join(',')
      )].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="messages.csv"');
      return res.send(csv);
    }

    const tsv = [fields.join('\t'), ...rows.map(r =>
      fields.map(f => r[f] ?? '').join('\t')
    )].join('\n');
    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', 'attachment; filename="messages.xls"');
    return res.send(tsv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function buildWhere(query) {
  const where = {};
  if (query.doctor_name) where.doctor_name = { [Op.like]: `%${query.doctor_name}%` };
  if (query.recipient_id) where.recipient_id = { [Op.like]: `%${query.recipient_id}%` };
  if (query.message_type) where.message_type = query.message_type;
  if (query.template_name) where.template_name = { [Op.like]: `%${query.template_name}%` };
  if (query.status) where.status = query.status;
  if (query.date_from || query.date_to) {
    where.createdAt = {};
    if (query.date_from) where.createdAt[Op.gte] = new Date(query.date_from);
    if (query.date_to) {
      const to = new Date(query.date_to);
      to.setHours(23, 59, 59, 999);
      where.createdAt[Op.lte] = to;
    }
  }
  return where;
}

// ── DOCTORS ──

// Stats for users page
router.get('/doctors/stats', auth, async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year) : null;
    const totalDoctors = await Doctor.count();
    const activeDoctors = await Doctor.count({ where: { is_active: true } });

    const msgWhere = {};
    if (year) {
      msgWhere.createdAt = {
        [Op.gte]: new Date(`${year}-01-01`),
        [Op.lte]: new Date(`${year}-12-31T23:59:59`),
      };
    }
    const totalMessages = await MessageLog.count({ where: msgWhere, attributes: SAFE_ATTRS });

    res.json({ totalDoctors, activeDoctors, inactiveDoctors: totalDoctors - activeDoctors, totalMessages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List doctors with msg count
router.get('/doctors', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const year = req.query.year ? parseInt(req.query.year) : null;
    const search = req.query.search || '';

    const where = {};
    if (search) where.name = { [Op.like]: `%${search}%` };
    if (req.query.status === 'active') where.is_active = true;
    if (req.query.status === 'inactive') where.is_active = false;

    const { count, rows } = await Doctor.findAndCountAll({ where, order: [['name', 'ASC']], limit, offset });

    const msgWhere = {};
    if (year) {
      msgWhere.createdAt = {
        [Op.gte]: new Date(`${year}-01-01`),
        [Op.lte]: new Date(`${year}-12-31T23:59:59`),
      };
    }

    const data = await Promise.all(rows.map(async d => {
      const msgCount = await MessageLog.count({ where: { ...msgWhere, doctor_id: d.id } });
      return { ...d.toJSON(), msgCount };
    }));

    res.json({ total: count, page, limit, pages: Math.ceil(count / limit), data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create doctor
router.post('/doctors', auth, async (req, res) => {
  try {
    const { name, phone, clinic_name, birthday, anniversary, clinic_anniversary } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required' });
    const doc = await Doctor.create({ name, phone, clinic_name, birthday: birthday||null, anniversary: anniversary||null, clinic_anniversary: clinic_anniversary||null });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update doctor
router.put('/doctors/:id', auth, async (req, res) => {
  try {
    const doc = await Doctor.findByPk(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const { name, phone, clinic_name, birthday, anniversary, clinic_anniversary } = req.body;
    await doc.update({ name, phone, clinic_name, birthday: birthday||null, anniversary: anniversary||null, clinic_anniversary: clinic_anniversary||null });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle active status
router.patch('/doctors/:id/toggle', auth, async (req, res) => {
  try {
    const doc = await Doctor.findByPk(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    await doc.update({ is_active: !doc.is_active });
    res.json({ id: doc.id, is_active: doc.is_active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete doctor
router.delete('/doctors/:id', auth, async (req, res) => {
  try {
    const doc = await Doctor.findByPk(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    await doc.destroy();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
