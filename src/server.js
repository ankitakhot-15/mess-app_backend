const env = require('./config/env');
const app = require('./app');
const logger = require('./utils/logger');

const server = app.listen(env.port, () => logger.info(`Mess API running on port ${env.port} (${env.nodeEnv})`));

process.on('unhandledRejection', (e) => logger.error('Unhandled rejection', e));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
