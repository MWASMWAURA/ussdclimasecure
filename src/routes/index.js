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
router.get('/farmers', async (req, res) => {
  try {
    const farmers = await FarmerModel.findAll();
    res.json({ success: true, count: farmers.length, farmers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get farmer by ID
 */
router.get('/farmers/:id', async (req, res) => {
  try {
    const farmer = await FarmerModel.findById(req.params.id);
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
router.get('/farmers/phone/:phone', async (req, res) => {
  try {
    const farmer = await FarmerModel.findByPhone(req.params.phone);
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
router.post('/farmers', async (req, res) => {
  try {
    const { phoneNumber, nationalId, county } = req.body;
    
    if (!phoneNumber || !nationalId || !county) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: phoneNumber, nationalId, county' 
      });
    }
    
    // Check if farmer exists
    const existing = await FarmerModel.findByNationalId(nationalId);
    if (existing) {
      return res.status(400).json({ success: false, error: 'Farmer with this National ID already exists' });
    }
    
    // Create farmer and policy
    const farmer = await FarmerModel.create(phoneNumber, nationalId, county);
    const policy = await PolicyModel.create(farmer._id, config.insurance.premiumAmount);
    
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
router.get('/policies', async (req, res) => {
  try {
    const { status, county } = req.query;
    let policies;
    
    if (county) {
      policies = await PolicyModel.findActiveByCounty(county);
    } else {
      policies = await db.findMany('policies', {});
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
router.get('/policies/:id', async (req, res) => {
  try {
    const policy = await PolicyModel.findById(req.params.id);
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
router.get('/policies/farmer/:farmerId', async (req, res) => {
  try {
    const policy = await PolicyModel.findByFarmerId(req.params.farmerId);
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
router.get('/claims', async (req, res) => {
  try {
    const { status, county } = req.query;
    let claims = await ClaimModel.findAll();
    
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
router.get('/claims/:id', async (req, res) => {
  try {
    const claim = await ClaimModel.findById(req.params.id);
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
router.post('/claims', async (req, res) => {
  try {
    const { policyId, farmerId, eventType, eventDate, rainfallMm, triggerPercentile } = req.body;
    
    if (!policyId || !farmerId || !eventType || !eventDate) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }
    
    const claim = await ClaimModel.create(
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
router.post('/claims/:id/approve', async (req, res) => {
  try {
    const claim = await ClaimModel.findById(req.params.id);
    if (!claim) {
      return res.status(404).json({ success: false, error: 'Claim not found' });
    }
    
    await ClaimModel.updateStatus(claim._id, 'approved');
    res.json({ success: true, message: 'Claim approved' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Reject claim (admin)
 */
router.post('/claims/:id/reject', async (req, res) => {
  try {
    const claim = await ClaimModel.findById(req.params.id);
    if (!claim) {
      return res.status(404).json({ success: false, error: 'Claim not found' });
    }
    
    await ClaimModel.updateStatus(claim._id, 'rejected');
    res.json({ success: true, message: 'Claim rejected' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== RAINFALL DATA ROUTES ====================

/**
 * Get rainfall thresholds
 */
router.get('/thresholds', async (req, res) => {
  try {
    const thresholds = await RainfallThresholdModel.getAll();
    res.json({ success: true, thresholds });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get threshold for a county
 */
router.get('/thresholds/:county', async (req, res) => {
  try {
    const threshold = await RainfallThresholdModel.getByCounty(req.params.county);
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
router.put('/thresholds/:county', async (req, res) => {
  try {
    const { percentile90, percentile95 } = req.body;
    
    if (!percentile90 || !percentile95) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: percentile90, percentile95' 
      });
    }
    
    await RainfallThresholdModel.update(req.params.county, percentile90, percentile95);
    res.json({ success: true, message: 'Threshold updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Add rainfall data
 */
router.post('/rainfall', async (req, res) => {
  try {
    const { county, date, rainfallMm, source } = req.body;
    
    if (!county || !date || !rainfallMm) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: county, date, rainfallMm' 
      });
    }
    
    const data = await RainfallDataModel.add(county, date, rainfallMm, source || 'manual');
    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get rainfall data for a county
 */
router.get('/rainfall/:county', async (req, res) => {
  try {
    const { days } = req.query;
    const data = await RainfallDataModel.getRecentByCounty(req.params.county, parseInt(days) || 7);
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
router.get('/recovery-kits', async (req, res) => {
  try {
    const { status, farmerId } = req.query;
    let kits;
    
    if (farmerId) {
      kits = await RecoveryKitModel.findByFarmerId(farmerId);
    } else {
      kits = await db.findMany('recovery_kits', {});
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
router.post('/recovery-kits/:id/distribute', async (req, res) => {
  try {
    await RecoveryKitModel.markDistributed(req.params.id);
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
router.get('/stats', async (req, res) => {
  try {
    const farmers = await FarmerModel.findAll();
    const policies = await db.findMany('policies', { status: 'active' });
    const claims = await ClaimModel.findAll();
    
    const pendingClaims = claims.filter(c => c.status === 'pending');
    const paidClaims = claims.filter(c => c.payout_status === 'paid');
    const totalPayouts = paidClaims.reduce((sum, c) => sum + (c.amount_approved || 0), 0);
    
    res.json({
      success: true,
      stats: {
        farmers: farmers.length,
        activePolicies: policies.length,
        pendingClaims: pendingClaims.length,
        paidClaims: paidClaims.length,
        totalPayouts: totalPayouts
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== M-PESA CALLBACK ROUTES ====================

/**
 * M-Pesa STK Push Callback - Handle payment confirmation
 */
router.post('/mpesa/stk-callback', async (req, res) => {
  try {
    const callbackBody = req.body;
    console.log('STK Callback received:', JSON.stringify(callbackBody));
    
    // M-Pesa sends the callback with Body -> stkCallback
    const stkCallback = callbackBody.Body?.stkCallback;
    
    if (!stkCallback) {
      return res.status(400).json({ success: false, error: 'Invalid callback format' });
    }
    
    const resultCode = stkCallback.ResultCode;
    const resultDesc = stkCallback.ResultDesc;
    const checkoutRequestId = stkCallback.CheckoutRequestID;
    
    // Check if payment was successful
    if (resultCode === 0) {
      // Payment successful - find the policy by checkout request or phone
      // For now, we'll look for pending_payment policies
      const pendingPolicies = await db.findMany('policies', { status: 'pending_payment' });
      
      if (pendingPolicies && pendingPolicies.length > 0) {
        // Get the most recent pending policy
        const policy = pendingPolicies[pendingPolicies.length - 1];
        
        // Get farmer details
        const farmer = await FarmerModel.findById(policy.farmer_id);
        
        // Update policy to active
        await PolicyModel.updateStatus(policy._id, 'active');
        
        // Send confirmation SMS
        if (farmer) {
          const smsMessage = `🌾 Welcome to ${config.app.name}!\n\n` +
            `Your policy is now ACTIVE!\n\n` +
            `📋 Policy #: ${policy.policy_number}\n` +
            `👤 Name: ${farmer.national_id}\n` +
            `📍 County: ${farmer.county}\n` +
            `💰 Coverage: KES ${policy.coverage_amount.toLocaleString()}\n` +
            `💵 Premium Paid: KES ${policy.premium_paid}\n` +
            `📅 Valid until: ${policy.end_date}\n\n` +
            `You will receive automatic payouts if heavy rainfall triggers a claim in ${farmer.county}.\n\n` +
            `Dial *318# for services.`;
          
          try {
            const formattedPhone = farmer.phone_number.startsWith('+') ? farmer.phone_number : `+${farmer.phone_number}`;
            await sendSms(formattedPhone, smsMessage);
            console.log('Activation SMS sent to:', farmer.phone_number);
          } catch (smsError) {
            console.error('Failed to send activation SMS:', smsError);
          }
        }
        
        console.log(`Policy ${policy.policy_number} activated for farmer ${farmer?.phone_number}`);
      }
      
      return res.json({ success: true, message: 'Payment processed successfully' });
    } else {
      // Payment failed
      console.log('Payment failed:', resultDesc);
      return res.json({ success: false, message: resultDesc });
    }
  } catch (error) {
    console.error('STK Callback Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

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

module.exports = router;
