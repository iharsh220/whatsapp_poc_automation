require('dotenv').config();
const app = require('./app');
const sequelize = require('./config/database');
const { startCron } = require('./jobs/birthdayCron');
require('./models/Doctor');
require('./models/MessageLog');

const PORT = process.env.PORT || 9001;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('Database connected');

    await sequelize.sync({ alter: false });
    console.log('Models synced');

    startCron();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Webhook: POST /osteofit/automation/webhook/status_callback`);
    });
  } catch (err) {
    console.error('Startup error:', err.message);
    process.exit(1);
  }
}

start();
