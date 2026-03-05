/**
 * ClimaSecure API Routes
 * Admin and management endpoints
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const config = require('../config');
const { 
  FarmerModel, 
  PolicyModel, 
  ClaimModel, 
  RainfallDataModel, 
  RainfallThresholdModel,
  RecoveryKitModel 
} = require('../models');
const { 
  sendStkPush, 
  sendB2CPayment, 
  getAccessToken 
} = require('../services/mpesaService');
const { processRainfallTriggers, getTriggerStatus } = require('../services/triggerService');
const { sendSms } = require('../ussd/africasTalking');

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: config.app.name,
    timestamp: new Date().toISOString()
  });
});

// ==================== FARMER ROUTES ====================

/**
 * Get all farmers
 */
router.get('/farmers', (req, res) => {
  try {
    const farmers = FarmerModel.findAll();
    res.json({ success: true, count: farmers.length, farmers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get farmer by ID
 */
router.get('/farmers/:id', (req, res) => {
  try {
    const farmer = FarmerModel.findById(req.params.id);
    if (!farmer) {
      return res.status(404).json({ success: false, error: 'Farmer not found' });
    }
    res.json({ success: true, farmer });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get farmer by phone
 */
router.get('/farmers/phone/:phone', (req, res) => {
  try {
    const farmer = FarmerModel.findByPhone(req.params.phone);
    if (!farmer) {
      return res.status(404).json({ success: false, error: 'Farmer not found' });
    }
    res.json({ success: true, farmer });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Register a new farmer (API)
 */
router.post('/farmers', (req, res) => {
  try {
    const { phoneNumber, nationalId, county } = req.body;
    
    if (!phoneNumber || !nationalId || !county) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: phoneNumber, nationalId, county' 
      });
    }
    
    // Check if farmer exists
    const existing = FarmerModel.findByNationalId(nationalId);
    if (existing) {
      return res.status(400).json({ success: false, error: 'Farmer with this National ID already exists' });
    }
    
    // Create farmer and policy
    const farmer = FarmerModel.create(phoneNumber, nationalId, county);
    const policy = PolicyModel.create(farmer.id, config.insurance.premiumAmount);
    
    res.status(201).json({ 
      success: true, 
      farmer, 
      policy 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== POLICY ROUTES ====================

/**
 * Get all policies
 */
router.get('/policies', (req, res) => {
  try {
    const { status, county } = req.query;
    let policies;
    
    if (county) {
      policies = PolicyModel.findActiveByCounty(county);
    } else {
      policies = db.all('SELECT * FROM policies ORDER BY created_at DESC');
    }
    
    if (status) {
      policies = policies.filter(p => p.status === status);
    }
    
    res.json({ success: true, count: policies.length, policies });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get policy by ID
 */
router.get('/policies/:id', (req, res) => {
  try {
    const policy = PolicyModel.findById(req.params.id);
    if (!policy) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }
    res.json({ success: true, policy });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get policy by farmer ID
 */
router.get('/policies/farmer/:farmerId', (req, res) => {
  try {
    const policy = PolicyModel.findByFarmerId(req.params.farmerId);
    if (!policy) {
      return res.status(404).json({ success: false, error: 'Policy not found' });
    }
    res.json({ success: true, policy });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== CLAIM ROUTES ====================

/**
 * Get all claims
 */
router.get('/claims', (req, res) => {
  try {
    const { status, county } = req.query;
    let claims = ClaimModel.findAll();
    
    if (status) {
      claims = claims.filter(c => c.status === status);
    }
    
    if (county) {
      claims = claims.filter(c => c.county === county);
    }
    
    res.json({ success: true, count: claims.length, claims });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get claim by ID
 */
router.get('/claims/:id', (req, res) => {
  try {
    const claim = ClaimModel.findById(req.params.id);
    if (!claim) {
      return res.status(404).json({ success: false, error: 'Claim not found' });
    }
    res.json({ success: true, claim });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Manual claim creation (admin)
 */
router.post('/claims', (req, res) => {
  try {
    const { policyId, farmerId, eventType, eventDate, rainfallMm, triggerPercentile } = req.body;
    
    if (!policyId || !farmerId || !eventType || !eventDate) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }
    
    const claim = ClaimModel.create(
      policyId, 
      farmerId, 
      eventType, 
      eventDate, 
      rainfallMm || 0, 
      triggerPercentile || 90
    );
    
    res.status(201).json({ success: true, claim });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Approve claim (admin)
 */
router.post('/claims/:id/approve', (req, res) => {
  try {
    const claim = ClaimModel.findById(req.params.id);
    if (!claim) {
      return res.status(404).json({ success: false, error: 'Claim not found' });
    }
    
    ClaimModel.updateStatus(claim.id, 'approved');
    res.json({ success: true, message: 'Claim approved' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Reject claim (admin)
 */
router.post('/claims/:id/reject', (req, res) => {
  try {
    const claim = ClaimModel.findById(req.params.id);
    if (!claim) {
      return res.status(404).json({ success: false, error: 'Claim not found' });
    }
    
    ClaimModel.updateStatus(claim.id, 'rejected');
    res.json({ success: true, message: 'Claim rejected' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== RAINFALL DATA ROUTES ====================

/**
 * Get rainfall thresholds
 */
router.get('/thresholds', (req, res) => {
  try {
    const thresholds = RainfallThresholdModel.getAll();
    res.json({ success: true, thresholds });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get threshold for a county
 */
router.get('/thresholds/:county', (req, res) => {
  try {
    const threshold = RainfallThresholdModel.getByCounty(req.params.county);
    if (!threshold) {
      return res.status(404).json({ success: false, error: 'Threshold not found' });
    }
    res.json({ success: true, threshold });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Update rainfall threshold
 */
router.put('/thresholds/:county', (req, res) => {
  try {
    const { percentile90, percentile95 } = req.body;
    
    if (!percentile90 || !percentile95) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: percentile90, percentile95' 
      });
    }
    
    RainfallThresholdModel.update(req.params.county, percentile90, percentile95);
    res.json({ success: true, message: 'Threshold updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Add rainfall data
 */
router.post('/rainfall', (req, res) => {
  try {
    const { county, date, rainfallMm, source } = req.body;
    
    if (!county || !date || !rainfallMm) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: county, date, rainfallMm' 
      });
    }
    
    const data = RainfallDataModel.add(county, date, rainfallMm, source || 'manual');
    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get rainfall data for a county
 */
router.get('/rainfall/:county', (req, res) => {
  try {
    const { days } = req.query;
    const data = RainfallDataModel.getRecentByCounty(req.params.county, parseInt(days) || 7);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get trigger status for all counties
 */
router.get('/triggers/status', (req, res) => {
  try {
    const status = getTriggerStatus();
    res.json({ success: true, status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Manually trigger claim check
 */
router.post('/triggers/check', async (req, res) => {
  try {
    const results = await processRainfallTriggers();
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== RECOVERY KIT ROUTES ====================

/**
 * Get all recovery kits
 */
router.get('/recovery-kits', (req, res) => {
  try {
    const { status, farmerId } = req.query;
    let kits;
    
    if (farmerId) {
      kits = RecoveryKitModel.findByFarmerId(farmerId);
    } else {
      const dbModule = require('../db');
      kits = dbModule.all('SELECT * FROM recovery_kits ORDER BY created_at DESC');
    }
    
    if (status) {
      kits = kits.filter(k => k.status === status);
    }
    
    res.json({ success: true, count: kits.length, kits });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Mark kit as distributed
 */
router.post('/recovery-kits/:id/distribute', (req, res) => {
  try {
    RecoveryKitModel.markDistributed(req.params.id);
    res.json({ success: true, message: 'Kit marked as distributed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== NOTIFICATION ROUTES ====================

/**
 * Send SMS to farmer
 */
router.post('/notifications/sms', async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;
    
    if (!phoneNumber || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: phoneNumber, message' 
      });
    }
    
    const result = await sendSms(phoneNumber, message);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== STATISTICS ROUTES ====================

/**
 * Get dashboard statistics
 */
router.get('/stats', (req, res) => {
  try {
    const dbModule = require('../db');
    
    const farmerCount = dbModule.get('SELECT COUNT(*) as count FROM farmers');
    const activePolicies = dbModule.get("SELECT COUNT(*) as count FROM policies WHERE status = 'active'");
    const pendingClaims = dbModule.get("SELECT COUNT(*) as count FROM claims WHERE status = 'pending'");
    const paidClaims = dbModule.get("SELECT COUNT(*) as count FROM claims WHERE payout_status = 'paid'");
    const totalPayouts = dbModule.get("SELECT SUM(amount_approved) as total FROM claims WHERE payout_status = 'paid'");
    
    res.json({
      success: true,
      stats: {
        farmers: farmerCount.count,
        activePolicies: activePolicies.count,
        pendingClaims: pendingClaims.count,
        paidClaims: paidClaims.count,
        totalPayouts: totalPayouts.total || 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

// ==================== M-PESA TEST ROUTES ====================

/**
 * Test M-Pesa connection
 */
router.get('/mpesa/test-auth', async (req, res) => {
  try {
    const token = await getAccessToken();
    res.json({ success: true, message: 'M-Pesa auth working', tokenPrefix: token.substring(0, 10) + '...' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Test STK Push (simulate payment request)
 */
router.post('/mpesa/stk-push-test', async (req, res) => {
  try {
    const { phoneNumber, amount } = req.body;
    
    if (!phoneNumber || !amount) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: phoneNumber, amount' 
      });
    }
    
    // Format phone number
    const formattedPhone = phoneNumber.startsWith('254') ? phoneNumber : '254' + phoneNumber.substring(1);
    
    const result = await sendStkPush(formattedPhone, amount);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Test B2C Payment (payout to farmer)
 */
router.post('/mpesa/b2c-test', async (req, res) => {
  try {
    const { phoneNumber, amount } = req.body;
    
    if (!phoneNumber || !amount) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: phoneNumber, amount' 
      });
    }
    
    // Format phone number
    const formattedPhone = phoneNumber.startsWith('254') ? phoneNumber : '254' + phoneNumber.substring(1);
    
    const result = await sendB2CPayment(formattedPhone, amount, 'ClimaSecure Test Payout');
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
