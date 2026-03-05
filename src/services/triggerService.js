/**
 * ClimaSecure Parametric Trigger Service
 * Monitors rainfall data and automatically triggers claims when thresholds are exceeded
 */

const config = require('../config');
const { 
  FarmerModel, 
  PolicyModel, 
  ClaimModel, 
  RainfallDataModel, 
  RainfallThresholdModel,
  RecoveryKitModel 
} = require('../models');
const { sendB2CPayment } = require('./mpesaService');
const { sendSms } = require('../ussd/africasTalking');

/**
 * Check if rainfall exceeds trigger threshold for a county
 */
function checkThreshold(county, rainfallMm) {
  const threshold = RainfallThresholdModel.getByCounty(county);
  
  if (!threshold) {
    console.log(`No threshold found for county: ${county}`);
    return { triggered: false, reason: 'No threshold defined' };
  }
  
  // Check 90th percentile trigger
  if (rainfallMm >= threshold.percentile_90) {
    return {
      triggered: true,
      percentile: rainfallMm >= threshold.percentile_95 ? 95 : 90,
      threshold: rainfallMm >= threshold.percentile_95 ? threshold.percentile_95 : threshold.percentile_90,
      severity: rainfallMm >= threshold.percentile_95 ? 'severe' : 'moderate'
    };
  }
  
  return { triggered: false, reason: 'Below threshold' };
}

/**
 * Process rainfall data for all counties and trigger claims if needed
 */
async function processRainfallTriggers() {
  console.log('Checking rainfall triggers...');
  
  const latestData = RainfallDataModel.getLatestAll();
  const results = [];
  
  for (const data of latestData) {
    const check = checkThreshold(data.county, data.rainfall_mm);
    
    if (check.triggered) {
      console.log(`Trigger detected for ${data.county}: ${data.rainfall_mm}mm (${check.percentile}th percentile)`);
      
      const countyResults = await triggerClaimsForCounty(
        data.county, 
        data.date, 
        data.rainfall_mm, 
        check.percentile
      );
      
      results.push({
        county: data.county,
        date: data.date,
        rainfallMm: data.rainfall_mm,
        percentile: check.percentile,
        severity: check.severity,
        claimsTriggered: countyResults.length,
        claims: countyResults
      });
    }
  }
  
  return results;
}

/**
 * Trigger claims for all active policies in a county
 */
async function triggerClaimsForCounty(county, eventDate, rainfallMm, triggerPercentile) {
  // Get all active policies in the county
  const policies = PolicyModel.findActiveByCounty(county);
  const triggeredClaims = [];
  
  console.log(`Found ${policies.length} active policies in ${county}`);
  
  for (const policy of policies) {
    try {
      // Check if claim already exists for this event
      const existingClaim = ClaimModel.findByFarmerId(policy.farmer_id).find(
        c => c.event_date === eventDate && c.status !== 'rejected'
      );
      
      if (existingClaim) {
        console.log(`Claim already exists for farmer ${policy.farmer_id} on ${eventDate}`);
        continue;
      }
      
      // Create the claim
      const claim = ClaimModel.create(
        policy.id,
        policy.farmer_id,
        'flooding',
        eventDate,
        rainfallMm,
        triggerPercentile
      );
      
      // Send claim triggered notification
      const claimSms = `ClimaSecure Alert: Heavy rainfall (${rainfallMm}mm) detected in ${county}. Your claim is being processed. We will notify you when payout is sent.`;
      await sendSms(policy.phone_number, claimSms);
      
      // Approve the claim automatically (parametric insurance)
      ClaimModel.updateStatus(claim.id, 'approved');
      ClaimModel.updatePayout(claim.id, 'pending', null, null);
      
      // Process payout
      const payoutResult = await processClaimPayout(claim, policy);
      
      triggeredClaims.push({
        claimId: claim.id,
        claimNumber: claim.claim_number,
        farmerId: policy.farmer_id,
        phoneNumber: policy.phone_number,
        payoutStatus: payoutResult.success ? 'paid' : 'failed',
        payoutError: payoutResult.error || null
      });
      
    } catch (error) {
      console.error(`Error processing claim for farmer ${policy.farmer_id}:`, error);
    }
  }
  
  return triggeredClaims;
}

/**
 * Process claim payout via M-Pesa
 */
async function processClaimPayout(claim, policy) {
  const amount = config.insurance.payoutAmount;
  
  // Get farmer phone number
  const farmer = FarmerModel.findById(policy.farmer_id);
  
  if (!farmer || !farmer.phone_number) {
    console.error(`Farmer not found or no phone for claim ${claim.claim_number}`);
    return { success: false, error: 'Farmer not found' };
  }
  
  // Send B2C payment
  const payoutResult = await sendB2CPayment(
    farmer.phone_number,
    amount,
    `ClimaSecure Claim: ${claim.claim_number}`
  );
  
  if (payoutResult.success) {
    // Update claim with payout info
    ClaimModel.updatePayout(
      claim.id,
      'paid',
      payoutResult.conversationId || payoutResult.originatorConversationId,
      new Date().toISOString()
    );
    
    // Create recovery kit for the farmer
    RecoveryKitModel.create(
      claim.id,
      policy.farmer_id,
      'seeds_poultry'
    );
    
    console.log(`Payout successful for claim ${claim.claim_number}: KES ${amount} to ${farmer.phone_number}`);
    
    // Send SMS notification to farmer
    const smsMessage = `ClimaSecure: Your claim of KES ${amount.toLocaleString()} has been paid! Ref: ${claim.claim_number}. A Recovery Kit will be delivered to your farm. Thank you for being part of ClimaSecure!`;
    await sendSms(farmer.phone_number, smsMessage);
    
    return { success: true, reference: payoutResult.conversationId };
  } else {
    console.error(`Payout failed for claim ${claim.claim_number}:`, payoutResult.error);
    
    // Update claim with failed payout status
    ClaimModel.updatePayout(claim.id, 'failed', null, null);
    
    // Send failure notification
    const failSms = `ClimaSecure: Your claim ${claim.claim_number} could not be paid automatically. Our team will contact you shortly. We apologize for the inconvenience.`;
    await sendSms(farmer.phone_number, failSms);
    
    return { success: false, error: payoutResult.error };
  }
}

/**
 * Get current trigger status for all counties
 */
function getTriggerStatus() {
  const latestData = RainfallDataModel.getLatestAll();
  const thresholds = RainfallThresholdModel.getAll();
  
  const status = thresholds.map(threshold => {
    const rainfall = latestData.find(d => d.county === threshold.county);
    const rainfallMm = rainfall ? rainfall.rainfall_mm : null;
    
    let triggerLevel = 'normal';
    if (rainfallMm !== null) {
      if (rainfallMm >= threshold.percentile_95) {
        triggerLevel = 'severe';
      } else if (rainfallMm >= threshold.percentile_90) {
        triggerLevel = 'warning';
      }
    }
    
    return {
      county: threshold.county,
      currentRainfall: rainfallMm,
      rainfallDate: rainfall ? rainfall.date : null,
      threshold90: threshold.percentile_90,
      threshold95: threshold.percentile_95,
      triggerLevel,
      lastUpdated: threshold.last_updated
    };
  });
  
  return status;
}

/**
 * Calculate percentile from historical data
 */
function calculatePercentile(historicalData, percentile) {
  if (!historicalData || historicalData.length === 0) {
    return null;
  }
  
  const sorted = historicalData.map(d => d.rainfall_mm).sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  
  return sorted[Math.max(0, index)];
}

/**
 * Update thresholds based on historical data
 */
async function updateThresholdsFromHistory() {
  console.log('Updating rainfall thresholds from historical data...');
  
  const counties = config.counties;
  
  for (const county of counties) {
    const historicalData = RainfallDataModel.getHistoricalByCounty(county, 10);
    
    if (historicalData.length < 30) {
      console.log(`Insufficient data for ${county} (${historicalData.length} records)`);
      continue;
    }
    
    const p90 = calculatePercentile(historicalData, 90);
    const p95 = calculatePercentile(historicalData, 95);
    
    if (p90 && p95) {
      RainfallThresholdModel.update(county, p90, p95);
      console.log(`Updated thresholds for ${county}: P90=${p90}mm, P95=${p95}mm`);
    }
  }
}

module.exports = {
  checkThreshold,
  processRainfallTriggers,
  triggerClaimsForCounty,
  getTriggerStatus,
  calculatePercentile,
  updateThresholdsFromHistory
};
