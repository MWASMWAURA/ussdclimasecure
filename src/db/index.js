/**
 * ClimaSecure Database Module
 * MongoDB database connection and management
 */

const { MongoClient, ObjectId } = require('mongodb');
const config = require('../config');

let client = null;
let db = null;

/**
 * Initialize database connection
 */
async function initDatabase() {
  const mongoUri = config.db.mongoUri;
  
  if (!mongoUri) {
    throw new Error('MongoDB URI not configured. Please set MONGODB_URI in environment.');
  }
  
  try {
    client = new MongoClient(mongoUri);
    await client.connect();
    db = client.db();
    
    console.log('Connected to MongoDB successfully');
    
    // Initialize collections and indexes
    await initializeCollections();
    
    // Initialize sample data
    await initializeSampleData();
    
    return db;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

/**
 * Initialize MongoDB collections and indexes
 */
async function initializeCollections() {
  // Create collections
  await db.createCollection('farmers');
  await db.createCollection('policies');
  await db.createCollection('claims');
  await db.createCollection('rainfall_data');
  await db.createCollection('rainfall_thresholds');
  await db.createCollection('recovery_kits');
  
  // Create indexes
  await db.collection('farmers').createIndex({ phone_number: 1 }, { unique: true });
  await db.collection('farmers').createIndex({ national_id: 1 }, { unique: true });
  await db.collection('policies').createIndex({ farmer_id: 1 });
  await db.collection('policies').createIndex({ policy_number: 1 }, { unique: true });
  await db.collection('claims').createIndex({ policy_id: 1 });
  await db.collection('claims').createIndex({ farmer_id: 1 });
  await db.collection('claims').createIndex({ claim_number: 1 }, { unique: true });
  await db.collection('rainfall_data').createIndex({ county: 1, date: 1 }, { unique: true });
  await db.collection('rainfall_thresholds').createIndex({ county: 1 }, { unique: true });
  
  console.log('MongoDB collections and indexes initialized');
}

/**
 * Initialize sample data
 */
async function initializeSampleData() {
  const count = await db.collection('farmers').countDocuments();
  
  if (count > 0) {
    console.log('Sample data already exists, skipping initialization');
    return;
  }
  
  // Insert sample rainfall thresholds
  const thresholds = [
    { county: 'Kisumu', percentile_90: 85, percentile_95: 110 },
    { county: 'Tana River', percentile_90: 65, percentile_95: 90 },
    { county: 'Homa Bay', percentile_90: 90, percentile_95: 120 },
    { county: 'Migori', percentile_90: 95, percentile_95: 125 },
    { county: 'Siaya', percentile_90: 88, percentile_95: 115 },
    { county: 'Busia', percentile_90: 80, percentile_95: 105 },
    { county: 'Kakamega', percentile_90: 75, percentile_95: 100 }
  ];
  
  for (const t of thresholds) {
    await db.collection('rainfall_thresholds').updateOne(
      { county: t.county },
      { $set: { ...t, last_updated: new Date() } },
      { upsert: true }
    );
  }
  
  console.log('Sample rainfall thresholds initialized');
}

/**
 * Close database connection
 */
async function closeDatabase() {
  if (client) {
    await client.close();
    console.log('MongoDB connection closed');
  }
}

// Helper to insert one document
async function insertOne(collection, document) {
  const result = await db.collection(collection).insertOne(document);
  return result.insertedId;
}

// Helper to find one document
async function findOne(collection, query) {
  return await db.collection(collection).findOne(query);
}

// Helper to find many documents
async function findMany(collection, query, options = {}) {
  return await db.collection(collection).find(query, options).toArray();
}

// Helper to update one document
async function updateOne(collection, query, update) {
  return await db.collection(collection).updateOne(query, update);
}

// Helper to delete one document
async function deleteOne(collection, query) {
  return await db.collection(collection).deleteOne(query);
}

// Helper to count documents
async function countDocuments(collection, query = {}) {
  return await db.collection(collection).countDocuments(query);
}

module.exports = {
  initDatabase,
  closeDatabase,
  insertOne,
  findOne,
  findMany,
  updateOne,
  deleteOne,
  countDocuments,
  ObjectId,
  db: () => db
};
