const express = require('express');
const path = require('path');
const webhookRoutes = require('./webhooks/webhookRoutes');
const adminRoutes = require('./admin/adminRoutes');

const app = express();
app.use(express.json());

app.use('/osteofit/automation/webhook', webhookRoutes);
app.use('/osteofit/automation/admin', adminRoutes);

app.get('/osteofit/automation/health', (req, res) => res.json({ status: 'ok' }));

module.exports = app;
