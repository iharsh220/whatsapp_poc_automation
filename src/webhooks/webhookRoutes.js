const express = require('express');
const router = express.Router();
const doctorsAutomationHandler = require('./projects/doctors_automation');

// Register project handlers here
// Each project folder in src/webhooks/projects/ exports a handleStatus(s, cb) function
const PROJECT_HANDLERS = {
  doctors_automation: doctorsAutomationHandler,
  // Add future projects here:
  // pharma_automation: require('./projects/pharma_automation'),
};

// Extract project type from callback data (supports both `pt` and `project_type` keys)
function extractProjectType(cb) {
  return cb.pt || cb.project_type || null;
}

router.post('/status_callback', async (req, res) => {
  // Respond immediately — never make WhatsApp wait
  res.status(200).json({ status: 'received' });

  const statuses = req.body.statuses || [];

  for (const s of statuses) {
    try {
      let cb = {};
      try { cb = JSON.parse(s.custom_callback_data || '{}'); } catch { }
      console.log(cb);
      const projectType = extractProjectType(cb);
      console.log(projectType);
      // Only process if the callback contains a recognized project_type
      // (pt field) OR a project_type field — either one matching a registered handler
      if (!projectType) {
        console.log(`[webhook] skipping — no project_type for ${s.recipient_id}`);
        continue;
      }

      const handler = PROJECT_HANDLERS[projectType];
      if (!handler) {
        console.log(`[webhook] skipping — unknown project_type: ${projectType} for ${s.recipient_id}`);
        continue;
      }

      await handler.handleStatus(s, cb);
    } catch (err) {
      console.error(`[webhook-error] ${s.id}:`, err.message);
    }
  }
});

module.exports = router;