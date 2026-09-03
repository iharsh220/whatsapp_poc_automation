const express = require('express');
const webhookRoutes = require('./webhooks/webhookRoutes');

const app = express();
app.use(express.json());

app.use('/osteofit/automation/webhook', webhookRoutes);

app.get('/osteofit/automation/health', (req, res) => res.json({ status: 'ok' }));

module.exports = app;
