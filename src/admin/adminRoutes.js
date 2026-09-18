const express = require('express');
const router = require('express').Router();
const path = require('path');
const { Op } = require('sequelize');
const MessageLog = require('../models/MessageLog');
const Doctor = require('../models/Doctor');
const multer = require('multer');
const XLSX = require('xlsx');

const { getQueueLength, clearQueues } = require('../services/queueService');

const upload = multer({ storage: multer.memoryStorage() });

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'Digi@2026';

const sessions = new Map();

function generateToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function auth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  const session = sessions.get(token);
  if (session) {
    req.session = session;
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

function divisionFilter(session) {
  if (session && session.type === 'doctor' && session.division) {
    return { division: session.division };
  }
  return {};
}

function requireSuperAdmin(req, res, next) {
  if (req.session && req.session.type === 'superadmin') return next();
  return res.status(403).json({ error: 'Super admin access required' });
}

router.use(express.static(path.join(__dirname, 'views')));

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    // Super admin login
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      const token = generateToken();
      sessions.set(token, { type: 'superadmin', division: null, name: 'Admin' });
      return res.json({ token, type: 'superadmin', division: null, name: 'Admin' });
    }

    // Doctor admin login (by phone or name)
    const doctor = await Doctor.findOne({
      where: {
        [Op.or]: [{ phone: username }, { name: username }],
        is_admin: true,
      },
    });

    if (doctor && doctor.password === password) {
      const token = generateToken();
      sessions.set(token, { type: 'doctor', division: doctor.division, name: doctor.name, doctorId: doctor.id });
      return res.json({ token, type: 'doctor', division: doctor.division, name: doctor.name });
    }

    return res.status(401).json({ error: 'Invalid credentials' });
  } catch (err) {
    console.error('[login-error]', err.message);
    return res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', auth, (req, res) => {
  sessions.delete(req.headers['x-admin-token']);
  res.json({ success: true });
});

router.get('/me', auth, (req, res) => {
  res.json(req.session);
});

router.get('/stats', auth, async (req, res) => {
  try {
    const where = buildWhere(req.query, req.session);
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
  'division', 'doctor_is_doctor', 'createdAt', 'updatedAt',
];

router.get('/messages', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const where = buildWhere(req.query, req.session);

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
    const where = buildWhere(req.query, req.session);
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

function buildWhere(query, session) {
  const where = { ...divisionFilter(session) };
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
    const divFilter = divisionFilter(req.session);
    const year = req.query.year ? parseInt(req.query.year) : null;
    const totalDoctors = await Doctor.count({ where: divFilter });
    const activeDoctors = await Doctor.count({ where: { ...divFilter, is_active: true } });

    const msgWhere = { ...divisionFilter(req.session) };
    if (year) {
      msgWhere.createdAt = {
        [Op.gte]: new Date(`${year}-01-01`),
        [Op.lte]: new Date(`${year}-12-31T23:59:59`),
      };
    }
    const totalMessages = await MessageLog.count({ where: msgWhere });

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

    const where = { ...divisionFilter(req.session) };
    if (search) where.name = { [Op.like]: `%${search}%` };
    if (req.query.status === 'active') where.is_active = true;
    if (req.query.status === 'inactive') where.is_active = false;

    const { count, rows } = await Doctor.findAndCountAll({ where, order: [['name', 'ASC']], limit, offset });

    const msgWhere = { ...divisionFilter(req.session) };
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
router.post('/doctors', auth, requireSuperAdmin, async (req, res) => {
  try {
    const { name, phone, clinic_name, birthday, anniversary, clinic_anniversary, is_doctor, is_admin, division, password } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required' });
    const doc = await Doctor.create({ name, phone, clinic_name, birthday: birthday||null, anniversary: anniversary||null, clinic_anniversary: clinic_anniversary||null, is_doctor: is_doctor !== undefined ? is_doctor : true, is_admin: is_admin !== undefined ? is_admin : false, division: division || null, password: password || 'Digi@2026' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update doctor
router.put('/doctors/:id', auth, requireSuperAdmin, async (req, res) => {
  try {
    const doc = await Doctor.findByPk(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    const { name, phone, clinic_name, birthday, anniversary, clinic_anniversary, is_doctor, is_admin, division, password } = req.body;
    await doc.update({ name, phone, clinic_name, birthday: birthday||null, anniversary: anniversary||null, clinic_anniversary: clinic_anniversary||null, is_doctor: is_doctor !== undefined ? is_doctor : doc.is_doctor, is_admin: is_admin !== undefined ? is_admin : doc.is_admin, division: division || null, password: password || doc.password });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Combined toggle: one click toggles both is_active and is_admin
// Super admins can do this for all doctors; division-admins only for their own division
router.patch('/doctors/:id/toggle-access', auth, async (req, res) => {
  try {
    const doc = await Doctor.findByPk(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    // Division-based access: doctor-admins can only modify doctors in their division
    if (req.session.type === 'doctor' && req.session.division && doc.division !== req.session.division) {
      return res.status(403).json({ error: 'Access denied: doctor belongs to a different division' });
    }

    await doc.update({ is_active: !doc.is_active, is_admin: !doc.is_admin });
    res.json({ id: doc.id, is_active: doc.is_active, is_admin: doc.is_admin });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle active status only (division-aware)
router.patch('/doctors/:id/toggle', auth, async (req, res) => {
  try {
    const doc = await Doctor.findByPk(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (req.session.type === 'doctor' && req.session.division && doc.division !== req.session.division) {
      return res.status(403).json({ error: 'Access denied: doctor belongs to a different division' });
    }
    await doc.update({ is_active: !doc.is_active });
    res.json({ id: doc.id, is_active: doc.is_active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle admin status only (division-aware)
router.patch('/doctors/:id/admin', auth, async (req, res) => {
  try {
    const doc = await Doctor.findByPk(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (req.session.type === 'doctor' && req.session.division && doc.division !== req.session.division) {
      return res.status(403).json({ error: 'Access denied: doctor belongs to a different division' });
    }
    const { is_admin } = req.body;
    await doc.update({ is_admin: is_admin !== undefined ? is_admin : !doc.is_admin });
    res.json({ id: doc.id, is_admin: doc.is_admin });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Unique divisions (for bulk action dropdown)
router.get('/doctors/divisions', auth, async (req, res) => {
  try {
    const divs = await Doctor.findAll({
      attributes: ['division'],
      where: { division: { [Op.ne]: null } },
      group: ['division'],
      raw: true,
    });
    res.json(divs.map(d => d.division));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk action: activate/deactivate/make-admin/remove-admin (optionally by division)
router.patch('/doctors/bulk-action', auth, async (req, res) => {
  try {
    const { action } = req.body;
    const { division } = req.query;

    const where = {};
    if (req.session.type === 'doctor' && req.session.division) {
      where.division = req.session.division;
    } else if (division) {
      where.division = division;
    }

    let update;
    switch (action) {
      case 'activate': update = { is_active: true }; break;
      case 'deactivate': update = { is_active: false }; break;
      case 'make_admin': update = { is_admin: true }; break;
      case 'remove_admin': update = { is_admin: false }; break;
      default: return res.status(400).json({ error: 'Invalid action' });
    }

    const [count] = await Doctor.update(update, { where });
    res.json({ updated: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk upload users via CSV/Excel with streaming progress
router.post('/doctors/upload-stream', auth, requireSuperAdmin, upload.single('file'), async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    if (!req.file) {
      res.write(`data: ${JSON.stringify({ error: 'No file uploaded' })}\n\n`);
      return res.end();
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    const totalRows = rows.length;
    let processed = 0;
    let added = 0;
    let skipped = 0;
    const chunkSize = 1000;

    for (let i = 0; i < totalRows; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);

      for (const row of chunk) {
        const name = String(row.name || '').trim();
        const phone = String(row.phone || '').trim();
        if (!name || !phone) { skipped++; continue; }

        const exists = await Doctor.findOne({ where: { phone } });
        if (exists) { skipped++; continue; }

        const clinic_name = row.clinic_name ? String(row.clinic_name).trim() : null;
        const birthday = row.birthday || null;
        const anniversary = row.anniversary || null;
        const clinic_anniversary = row.clinic_anniversary || null;
        let is_active = true;
        if (row.is_active !== undefined && row.is_active !== '') {
          const val = String(row.is_active).toLowerCase();
          is_active = val === 'true' || val === '1' || val === 'yes';
        }
        const division = row.division ? String(row.division).trim() : null;
        let is_doctor = true;
        if (row.is_doctor !== undefined && row.is_doctor !== '') {
          const val = String(row.is_doctor).toLowerCase();
          is_doctor = val === 'true' || val === '1' || val === 'yes';
        }

        await Doctor.create({
          name, phone, clinic_name, birthday, anniversary, clinic_anniversary, is_active, is_doctor, division,
        });
        added++;
      }

      processed += chunk.length;
      const progress = totalRows > 0 ? Math.round((processed / totalRows) * 100) : 0;

      res.write(`data: ${JSON.stringify({ total: totalRows, processed, added, skipped, progress })}\n\n`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    res.write(`data: ${JSON.stringify({ total: totalRows, processed, added, skipped, progress: 100, done: true })}\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// Delete doctor
router.delete('/doctors/:id', auth, requireSuperAdmin, async (req, res) => {
  try {
    const doc = await Doctor.findByPk(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    await doc.destroy();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Queue management
router.get('/queue', auth, async (req, res) => {
  try {
    const lengths = await getQueueLength();
    res.json(lengths);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/queue', auth, async (req, res) => {
  try {
    await clearQueues();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
