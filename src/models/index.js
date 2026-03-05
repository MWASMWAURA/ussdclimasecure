/**
 * ClimaSecure Database Models
 * Data access layer for all database operations
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../db');

/**
 * Farmer Model - Manages farmer registration and data
 */
const FarmerModel = {
  /**
   * Create a new farmer
   */
  create(phoneNumber, nationalId, county) {
    const id = uuidv4();
    db.run(
      `INSERT INTO farmers (id, phone_number, national_id, county) VALUES (?, ?, ?, ?)`,
      [id, phoneNumber, nationalId, county]
    );
    return this.findById(id);
  },

  /**
   * Find farmer by phone number
   */
  findByPhone(phoneNumber) {
    return db.get('SELECT * FROM farmers WHERE phone_number = ?', [phoneNumber]);
  },

  /**
   * Find farmer by ID
   */
  findById(id) {
    return db.get('SELECT * FROM farmers WHERE id = ?', [id]);
  },

  /**
   * Find farmer by national ID
   */
  findByNationalId(nationalId) {
    return db.get('SELECT * FROM farmers WHERE national_id = ?', [nationalId]);
  },

  /**
   * Update farmer details
   */
  update(id, data) {
    const updates = [];
    const values = [];
    
    if (data.county) {
      updates.push('county = ?');
      values.push(data.county);
    }
    
    if (data.phone_number) {
      updates.push('phone_number = ?');
      values.push(data.phone_number);
    }
    
    updates.push("updated_at = datetime('now')");
    values.push(id);
    
    db.run(`UPDATE farmers SET ${updates.join(', ')} WHERE id = ?`, values);
    return { changes: 1 };
  },

  /**
   * Get all farmers in a county
   */
  findByCounty(county) {
    return db.all('SELECT * FROM farmers WHERE county = ?', [county]);
  },

  /**
   * Get all farmers
   */
  findAll() {
    return db.all('SELECT * FROM farmers');
  }
};

/**
 * Policy Model - Manages insurance policies
 */
const PolicyModel = {
  /**
   * Create a new policy for a farmer
   */
  create(farmerId, premiumPaid = 0) {
    const id = uuidv4();
    const policyNumber = `CS-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    const startDate = new Date().toISOString().split('T')[0];
    const endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const config = require('../config');
    const coverageAmount = config.insurance.payoutAmount;
    
    db.run(
      `INSERT INTO policies (id, farmer_id, policy_number, premium_paid, coverage_amount, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, farmerId, policyNumber, premiumPaid, coverageAmount, startDate, endDate]
    );
    
    return this.findById(id);
  },

  /**
   * Find policy by ID
   */
  findById(id) {
    return db.get('SELECT * FROM policies WHERE id = ?', [id]);
  },

  /**
   * Find policy by farmer ID
   */
  findByFarmerId(farmerId) {
    return db.get('SELECT * FROM policies WHERE farmer_id = ? ORDER BY created_at DESC LIMIT 1', [farmerId]);
  },

  /**
   * Find policy by policy number
   */
  findByPolicyNumber(policyNumber) {
    return db.get('SELECT * FROM policies WHERE policy_number = ?', [policyNumber]);
  },

  /**
   * Update policy status
   */
  updateStatus(id, status) {
    db.run(`UPDATE policies SET status = ?, updated_at = datetime('now') WHERE id = ?`, [status, id]);
    return { changes: 1 };
  },

  /**
   * Get active policies by county
   */
  findActiveByCounty(county) {
    return db.all(
      `SELECT p.*, f.phone_number, f.national_id, f.county
       FROM policies p
       JOIN farmers f ON p.farmer_id = f.id
       WHERE f.county = ? AND p.status = 'active'`,
      [county]
    );
  }
};

/**
 * Claim Model - Manages insurance claims
 */
const ClaimModel = {
  /**
   * Create a new claim
   */
  create(policyId, farmerId, eventType, eventDate, rainfallMm, triggerPercentile) {
    const id = uuidv4();
    const claimNumber = `CLM-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    const config = require('../config');
    const amountClaimed = config.insurance.payoutAmount;
    
    db.run(
      `INSERT INTO claims (id, policy_id, farmer_id, claim_number, event_type, event_date, rainfall_mm, trigger_percentile, amount_claimed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, policyId, farmerId, claimNumber, eventType, eventDate, rainfallMm, triggerPercentile, amountClaimed]
    );
    
    return this.findById(id);
  },

  /**
   * Find claim by ID
   */
  findById(id) {
    return db.get('SELECT * FROM claims WHERE id = ?', [id]);
  },

  /**
   * Find claim by farmer ID
   */
  findByFarmerId(farmerId) {
    return db.all('SELECT * FROM claims WHERE farmer_id = ? ORDER BY created_at DESC', [farmerId]);
  },

  /**
   * Find claim by claim number
   */
  findByClaimNumber(claimNumber) {
    return db.get('SELECT * FROM claims WHERE claim_number = ?', [claimNumber]);
  },

  /**
   * Update claim status
   */
  updateStatus(id, status) {
    db.run(`UPDATE claims SET status = ?, updated_at = datetime('now') WHERE id = ?`, [status, id]);
    return { changes: 1 };
  },

  /**
   * Update claim payout info
   */
  updatePayout(id, payoutStatus, payoutReference, payoutDate) {
    db.run(
      `UPDATE claims SET payout_status = ?, payout_reference = ?, payout_date = ?, updated_at = datetime('now') WHERE id = ?`,
      [payoutStatus, payoutReference, payoutDate, id]
    );
    return { changes: 1 };
  },

  /**
   * Get pending claims by county
   */
  findPendingByCounty(county) {
    return db.all(
      `SELECT c.*, p.policy_number, f.phone_number, f.national_id, f.county
       FROM claims c
       JOIN policies p ON c.policy_id = p.id
       JOIN farmers f ON c.farmer_id = f.id
       WHERE f.county = ? AND c.status = 'pending'`,
      [county]
    );
  },

  /**
   * Get all claims
   */
  findAll() {
    return db.all(
      `SELECT c.*, p.policy_number, f.phone_number, f.national_id, f.county
       FROM claims c
       JOIN policies p ON c.policy_id = p.id
       JOIN farmers f ON c.farmer_id = f.id
       ORDER BY c.created_at DESC`
    );
  }
};

/**
 * RainfallData Model - Manages rainfall data
 */
const RainfallDataModel = {
  /**
   * Add rainfall data for a county
   */
  add(county, date, rainfallMm, source = 'satellite') {
    const id = uuidv4();
    db.run(
      `INSERT OR REPLACE INTO rainfall_data (id, county, date, rainfall_mm, source) VALUES (?, ?, ?, ?, ?)`,
      [id, county, date, rainfallMm, source]
    );
    return this.findByCountyAndDate(county, date);
  },

  /**
   * Find rainfall data by county and date
   */
  findByCountyAndDate(county, date) {
    return db.get('SELECT * FROM rainfall_data WHERE county = ? AND date = ?', [county, date]);
  },

  /**
   * Get recent rainfall data for a county
   */
  getRecentByCounty(county, days = 7) {
    return db.all(
      `SELECT * FROM rainfall_data WHERE county = ? ORDER BY date DESC LIMIT ?`,
      [county, days]
    );
  },

  /**
   * Get historical data for percentile calculation
   */
  getHistoricalByCounty(county, years = 10) {
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - years);
    
    return db.all(
      `SELECT * FROM rainfall_data WHERE county = ? AND date >= ? ORDER BY date DESC`,
      [county, startDate.toISOString().split('T')[0]]
    );
  },

  /**
   * Get latest rainfall data for all counties
   */
  getLatestAll() {
    return db.all(
      `SELECT r.* FROM rainfall_data r
       INNER JOIN (
         SELECT county, MAX(date) as max_date
         FROM rainfall_data
         GROUP BY county
       ) latest ON r.county = latest.county AND r.date = latest.max_date`
    );
  }
};

/**
 * RainfallThreshold Model - Manages trigger thresholds
 */
const RainfallThresholdModel = {
  /**
   * Get threshold for a county
   */
  getByCounty(county) {
    return db.get('SELECT * FROM rainfall_thresholds WHERE county = ?', [county]);
  },

  /**
   * Update threshold for a county
   */
  update(county, percentile90, percentile95) {
    db.run(
      `UPDATE rainfall_thresholds SET percentile_90 = ?, percentile_95 = ?, last_updated = datetime('now') WHERE county = ?`,
      [percentile90, percentile95, county]
    );
    return { changes: 1 };
  },

  /**
   * Get all thresholds
   */
  getAll() {
    return db.all('SELECT * FROM rainfall_thresholds');
  }
};

/**
 * RecoveryKit Model - Manages recovery kits distribution
 */
const RecoveryKitModel = {
  /**
   * Create a recovery kit for a claim
   */
  create(claimId, farmerId, kitType) {
    const id = uuidv4();
    db.run(
      `INSERT INTO recovery_kits (id, claim_id, farmer_id, kit_type) VALUES (?, ?, ?, ?)`,
      [id, claimId, farmerId, kitType]
    );
    return this.findById(id);
  },

  /**
   * Find recovery kit by ID
   */
  findById(id) {
    return db.get('SELECT * FROM recovery_kits WHERE id = ?', [id]);
  },

  /**
   * Find recovery kits by farmer ID
   */
  findByFarmerId(farmerId) {
    return db.all('SELECT * FROM recovery_kits WHERE farmer_id = ?', [farmerId]);
  },

  /**
   * Mark kit as distributed
   */
  markDistributed(id) {
    db.run(`UPDATE recovery_kits SET status = 'distributed', distributed_date = datetime('now') WHERE id = ?`, [id]);
    return { changes: 1 };
  }
};

module.exports = {
  FarmerModel,
  PolicyModel,
  ClaimModel,
  RainfallDataModel,
  RainfallThresholdModel,
  RecoveryKitModel
};
