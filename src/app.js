const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: env.corsOrigins.includes('*') ? true : env.corsOrigins }));
app.use(compression());
if (!env.isProd) app.use(morgan('dev'));

// Razorpay webhook needs the RAW body for signature verification (must be before express.json)
app.use('/api/v1/payments/webhook', express.raw({ type: 'application/json', limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false }));

app.get('/health', (req, res) => res.json({ success: true, status: 'ok', time: new Date().toISOString() }));
app.use('/api/v1', routes);

app.use(notFound);
app.use(errorHandler);
app.use('/api/v1/customer', require('./modules/tracking/tracking.routes'));

module.exports = app;
