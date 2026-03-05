/**
 * ClimaSecure Database Models
 * Data access layer for all database operations using MongoDB
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
  async create(phoneNumber, nationalId, county) {
    const farmer = {
      _id: uuidv4(),
      phone_number: phoneNumber,
      national_id: nationalId,
      county: county,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    await db.insertOne('farmers', farmer);
    return this.findById(farmer._id);
  },

  /**
   * Find farmer by phone number
   */
  async findByPhone(phoneNumber) {
    return await db.findOne('farmers', { phone_number: phoneNumber });
  },

  /**
   * Find farmer by ID
   */
  async findById(id) {
    return await db.findOne('farmers', { _id: id });
  },

  /**
   * Find farmer by national ID
   */
  async findByNationalId(nationalId) {
    return await db.findOne('farmers', { national_id: nationalId });
  },

  /**
   * Update farmer details
   */
  async update(id, data) {
    const updateData = { ...data, updated_at: new Date() };
    await db.updateOne('farmers', { _id: id }, { $set: updateData });
    return { changes: 1 };
  },

  /**
   * Get all farmers in a county
   */
  async findByCounty(county) {
    return await db.findMany('farmers', { county: county });
  },

  /**
   * Get all farmers
   */
  async findAll() {
    return await db.findMany('farmers', {});
  }
};

/**
 * Policy Model - Manages insurance policies
 */
const PolicyModel = {
  /**
   * Create a new policy for a farmer
   */
  async create(farmerId, premiumPaid = 0, status = 'active') {
    const policyNumber = `CS-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    const startDate = new Date().toISOString().split('T')[0];
    const endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const config = require('../config');
    const coverageAmount = config.insurance.payoutAmount;
    
    const policy = {
      _id: uuidv4(),
      farmer_id: farmerId,
      policy_number: policyNumber,
      status: status,
      premium_paid: premiumPaid,
      coverage_amount: coverageAmount,
      start_date: startDate,
      end_date: endDate,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    await db.insertOne('policies', policy);
    return this.findById(policy._id);
  },

  /**
   * Find policy by ID
   */
  async findById(id) {
    return await db.findOne('policies', { _id: id });
  },

  /**
   * Find policy by farmer ID
   */
  async findByFarmerId(farmerId) {
    const policies = await db.findMany('policies', { farmer_id: farmerId });
    return policies.length > 0 ? policies[0] : null;
  },

  /**
   * Find policy by policy number
   */
  async findByPolicyNumber(policyNumber) {
    return await db.findOne('policies', { policy_number: policyNumber });
  },

  /**
   * Update policy status
   */
  async updateStatus(id, status) {
    await db.updateOne('policies', { _id: id }, { $set: { status: status, updated_at: new Date() } });
    return { changes: 1 };
  },

  /**
   * Get active policies by county
   */
  async findActiveByCounty(county) {
    // Join farmers and policies
    const farmers = await db.findMany('farmers', { county: county });
    const farmerIds = farmers.map(f => f._id);
    return await db.findMany('policies', { farmer_id: { $in: farmerIds }, status: 'active' });
  }
};

/**
 * Claim Model - Manages insurance claims
 */
const ClaimModel = {
  /**
   * Create a new claim
   */
  async create(policyId, farmerId, eventType, eventDate, rainfallMm, triggerPercentile) {
    const claimNumber = `CLM-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    const config = require('../config');
    const amountClaimed = config.insurance.payoutAmount;
    
    const claim = {
      _id: uuidv4(),
      policy_id: policyId,
      farmer_id: farmerId,
      claim_number: claimNumber,
      event_type: eventType,
      event_date: eventDate,
      rainfall_mm: rainfallMm,
      trigger_percentile: triggerPercentile,
      amount_claimed: amountClaimed,
      amount_approved: 0,
      status: 'pending',
      payout_status: 'pending',
      payout_reference: null,
      payout_date: null,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    await db.insertOne('claims', claim);
    return this.findById(claim._id);
  },

  /**
   * Find claim by ID
   */
  async findById(id) {
    return await db.findOne('claims', { _id: id });
  },

  /**
   * Find claim by farmer ID
   */
  async findByFarmerId(farmerId) {
    return await db.findMany('claims', { farmer_id: farmerId });
  },

  /**
   * Find claim by claim number
   */
  async findByClaimNumber(claimNumber) {
    return await db.findOne('claims', { claim_number: claimNumber });
  },

  /**
   * Update claim status
   */
  async updateStatus(id, status) {
    await db.updateOne('claims', { _id: id }, { $set: { status: status, updated_at: new Date() } });
    return { changes: 1 };
  },

  /**
   * Update claim payout info
   */
  async updatePayout(id, payoutStatus, payoutReference, payoutDate) {
    await db.updateOne('claims', { _id: id }, { 
      $set: { 
        payout_status: payoutStatus, 
        payout_reference: payoutReference, 
        payout_date: payoutDate,
        updated_at: new Date() 
      } 
    });
    return { changes: 1 };
  },

  /**
   * Get pending claims by county
   */
  async findPendingByCounty(county) {
    const farmers = await db.findMany('farmers', { county: county });
    const farmerIds = farmers.map(f => f._id);
    return await db.findMany('claims', { farmer_id: { $in: farmerIds }, status: 'pending' });
  },

  /**
   * Get all claims
   */
  async findAll() {
    return await db.findMany('claims', {});
  }
};

/**
 * RainfallData Model - Manages rainfall data
 */
const RainfallDataModel = {
  /**
   * Add rainfall data for a county
   */
  async add(county, date, rainfallMm, source = 'satellite') {
    const data = {
      _id: uuidv4(),
      county: county,
      date: date,
      rainfall_mm: rainfallMm,
      source: source,
      created_at: new Date()
    };
    
    // Upsert - update if exists, insert if not
    await db.updateOne(
      'rainfall_data', 
      { county: county, date: date }, 
      { $set: data },
      { upsert: true }
    );
    
    return this.findByCountyAndDate(county, date);
  },

  /**
   * Find rainfall data by county and date
   */
  async findByCountyAndDate(county, date) {
    return await db.findOne('rainfall_data', { county: county, date: date });
  },

  /**
   * Get recent rainfall data for a county
   */
  async getRecentByCounty(county, days = 7) {
    const results = await db.findMany('rainfall_data', { county: county });
    return results
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, days);
  },

  /**
   * Get historical data for percentile calculation
   */
  async getHistoricalByCounty(county, years = 10) {
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - years);
    
    return await db.findMany('rainfall_data', { 
      county: county,
      date: { $gte: startDate.toISOString().split('T')[0] }
    });
  },

  /**
   * Get latest rainfall data for all counties
   */
  async getLatestAll() {
    const allData = await db.findMany('rainfall_data', {});
    const latestByCounty = {};
    
    for (const data of allData) {
      if (!latestByCounty[data.county] || new Date(data.date) > new Date(latestByCounty[data.county].date)) {
        latestByCounty[data.county] = data;
      }
    }
    
    return Object.values(latestByCounty);
  }
};

/**
 * RainfallThreshold Model - Manages trigger thresholds
 */
const RainfallThresholdModel = {
  /**
   * Get threshold for a county
   */
  async getByCounty(county) {
    return await db.findOne('rainfall_thresholds', { county: county });
  },

  /**
   * Update threshold for a county
   */
  async update(county, percentile90, percentile95) {
    await db.updateOne(
      'rainfall_thresholds', 
      { county: county }, 
      { $set: { percentile_90: percentile90, percentile_95: percentile95, last_updated: new Date() } },
      { upsert: true }
    );
    return { changes: 1 };
  },

  /**
   * Get all thresholds
   */
  async getAll() {
    return await db.findMany('rainfall_thresholds', {});
  }
};

/**
 * RecoveryKit Model - Manages recovery kits distribution
 */
const RecoveryKitModel = {
  /**
   * Create a recovery kit for a claim
   */
  async create(claimId, farmerId, kitType) {
    const kit = {
      _id: uuidv4(),
      claim_id: claimId,
      farmer_id: farmerId,
      kit_type: kitType,
      status: 'pending',
      distributed_date: null,
      created_at: new Date()
    };
    
    await db.insertOne('recovery_kits', kit);
    return this.findById(kit._id);
  },

  /**
   * Find recovery kit by ID
   */
  async findById(id) {
    return await db.findOne('recovery_kits', { _id: id });
  },

  /**
   * Find recovery kits by farmer ID
   */
  async findByFarmerId(farmerId) {
    return await db.findMany('recovery_kits', { farmer_id: farmerId });
  },

  /**
   * Mark kit as distributed
   */
  async markDistributed(id) {
    await db.updateOne('recovery_kits', { _id: id }, { $set: { status: 'distributed', distributed_date: new Date() } });
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
