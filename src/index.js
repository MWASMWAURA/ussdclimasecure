/**
 * ClimaSecure - Main Application Entry Point
 * USSD-based climate microinsurance platform for smallholder farmers in Kenya
 */

const express = require('express');
const cors = require('cors');
const config = require('./config');
const routes = require('./routes');
const { handleUssdRequest } = require('./ussd/africasTalking');
const cron = require('node-cron');
const { initDatabase } = require('./db');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ==================== ROUTES ====================

/**
 * USSD Callback endpoint
 * Africa's Talking will send USSD requests to this endpoint
 */
app.post('/ussd', handleUssdRequest);

/**
 * USSD endpoint (alternative)
 */
app.post('/api/ussd', handleUssdRequest);

/**
 * M-Pesa callback endpoints
 */
app.post('/mpesa/callback', (req, res) => {
  console.log('M-Pesa Callback received:', JSON.stringify(req.body, null, 2));
  res.json({ success: true });
});

app.post('/mpesa/result', (req, res) => {
  console.log('M-Pesa Result received:', JSON.stringify(req.body, null, 2));
  res.json({ success: true });
});

app.post('/mpesa/timeout', (req, res) => {
  console.log('M-Pesa Timeout received:', JSON.stringify(req.body, null, 2));
  res.json({ success: true });
});

// API routes
app.use('/api', routes);

// ==================== SCHEDULED TASKS ====================

/**
 * Check rainfall triggers every hour
 */
cron.schedule('0 * * * *', async () => {
  console.log('Running scheduled rainfall trigger check...');
  try {
    const { processRainfallTriggers } = require('./services/triggerService');
    const results = await processRainfallTriggers();
    if (results.length > 0) {
      console.log(`Trigger check complete. ${results.length} counties with triggers.`);
    }
  } catch (error) {
    console.error('Error in scheduled trigger check:', error);
  }
});

/**
 * Update thresholds from historical data daily at midnight
 */
cron.schedule('0 0 * * *', async () => {
  console.log('Running scheduled threshold update...');
  try {
    const { updateThresholdsFromHistory } = require('./services/triggerService');
    await updateThresholdsFromHistory();
  } catch (error) {
    console.error('Error in scheduled threshold update:', error);
  }
});

// ==================== ERROR HANDLING ====================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Application Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ==================== SERVER STARTUP ====================

async function startServer() {
  try {
    // Initialize database
    await initDatabase();
    
    const PORT = config.port;
    
    app.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🌾 ClimaSecure - Climate Insurance Platform                ║
║                                                               ║
║   Server running on port ${PORT}                                 ║
║   Environment: ${config.nodeEnv}                                    ║
║                                                               ║
║   USSD Short Code: ${config.africaTalking.ussdShortCode}                               ║
║   Premium: KES ${config.insurance.premiumAmount}/year                                   ║
║   Payout: KES ${config.insurance.payoutAmount}                                        ║
║   Trigger: ${config.insurance.rainfallTriggerPercentile}th percentile                                      ║
║                                                               ║
║   Endpoints:                                                  ║
║   - POST /ussd (USSD callback)                               ║
║   - POST /mpesa/callback (M-Pesa payment)                    ║
║   - GET  /api/health (Health check)                           ║
║                                                               ║
║   Counties covered: ${config.counties.length}                                       ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
