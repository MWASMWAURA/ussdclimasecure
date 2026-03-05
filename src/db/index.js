/**
 * ClimaSecure Database Module
 * SQLite database initialization and connection management using sql.js
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const config = require('../config');

let db = null;

/**
 * Initialize database
 */
async function initDatabase() {
  const SQL = await initSqlJs();
  
  // Ensure data directory exists
  const dbDir = path.dirname(config.db.path);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Try to load existing database
  if (fs.existsSync(config.db.path)) {
    const fileBuffer = fs.readFileSync(config.db.path);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Initialize schema
  initializeSchema();
  
  // Initialize sample data
  initializeSampleData();
  
  return db;
}

/**
 * Save database to file
 */
function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(config.db.path, buffer);
  }
}

/**
 * Initialize database schema
 */
function initializeSchema() {
  // Create farmers table
  db.run(`
    CREATE TABLE IF NOT EXISTS farmers (
      id TEXT PRIMARY KEY,
      phone_number TEXT NOT NULL UNIQUE,
      national_id TEXT NOT NULL UNIQUE,
      county TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create policies table
  db.run(`
    CREATE TABLE IF NOT EXISTS policies (
      id TEXT PRIMARY KEY,
      farmer_id TEXT NOT NULL,
      policy_number TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'active',
      premium_paid REAL DEFAULT 0,
      coverage_amount REAL DEFAULT 0,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (farmer_id) REFERENCES farmers(id)
    )
  `);

  // Create claims table
  db.run(`
    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      policy_id TEXT NOT NULL,
      farmer_id TEXT NOT NULL,
      claim_number TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      event_date TEXT NOT NULL,
      rainfall_mm REAL,
      trigger_percentile REAL,
      amount_claimed REAL DEFAULT 0,
      amount_approved REAL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      payout_status TEXT DEFAULT 'pending',
      payout_reference TEXT,
      payout_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (policy_id) REFERENCES policies(id),
      FOREIGN KEY (farmer_id) REFERENCES farmers(id)
    )
  `);

  // Create rainfall_data table
  db.run(`
    CREATE TABLE IF NOT EXISTS rainfall_data (
      id TEXT PRIMARY KEY,
      county TEXT NOT NULL,
      date TEXT NOT NULL,
      rainfall_mm REAL NOT NULL,
      source TEXT DEFAULT 'satellite',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(county, date)
    )
  `);

  // Create rainfall_thresholds table
  db.run(`
    CREATE TABLE IF NOT EXISTS rainfall_thresholds (
      id TEXT PRIMARY KEY,
      county TEXT NOT NULL UNIQUE,
      percentile_90 REAL NOT NULL,
      percentile_95 REAL NOT NULL,
      last_updated TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create recovery_kits table
  db.run(`
    CREATE TABLE IF NOT EXISTS recovery_kits (
      id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL,
      farmer_id TEXT NOT NULL,
      kit_type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      distributed_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (claim_id) REFERENCES claims(id),
      FOREIGN KEY (farmer_id) REFERENCES farmers(id)
    )
  `);

  // Create indices
  db.run(`CREATE INDEX IF NOT EXISTS idx_farmers_phone ON farmers(phone_number)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_farmers_national_id ON farmers(national_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_policies_farmer ON policies(farmer_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_claims_policy ON claims(policy_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_claims_farmer ON claims(farmer_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_rainfall_county_date ON rainfall_data(county, date)`);

  console.log('Database schema initialized successfully');
  saveDatabase();
}

/**
 * Initialize sample data
 */
function initializeSampleData() {
  const result = db.exec('SELECT COUNT(*) as count FROM farmers');
  const count = result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : 0;
  
  if (count > 0) {
    console.log('Sample data already exists, skipping initialization');
    return;
  }

  // Insert sample rainfall thresholds
  const thresholds = [
    { id: 'thresh_kisumu', county: 'Kisumu', p90: 85, p95: 110 },
    { id: 'thresh_tana_river', county: 'Tana River', p90: 65, p95: 90 },
    { id: 'thresh_homa_bay', county: 'Homa Bay', p90: 90, p95: 120 },
    { id: 'thresh_migori', county: 'Migori', p90: 95, p95: 125 },
    { id: 'thresh_siaya', county: 'Siaya', p90: 88, p95: 115 },
    { id: 'thresh_busia', county: 'Busia', p90: 80, p95: 105 },
    { id: 'thresh_kakamega', county: 'Kakamega', p90: 75, p95: 100 }
  ];

  const now = new Date().toISOString();
  for (const t of thresholds) {
    db.run(
      `INSERT OR IGNORE INTO rainfall_thresholds (id, county, percentile_90, percentile_95, last_updated) VALUES (?, ?, ?, ?, ?)`,
      [t.id, t.county, t.p90, t.p95, now]
    );
  }

  console.log('Sample rainfall thresholds initialized');
  saveDatabase();
}

// Helper to run queries
function run(sql, params = []) {
  db.run(sql, params);
  saveDatabase();
}

// Helper to get one row
function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

// Helper to get all rows
function all(sql, params = []) {
  const results = [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

module.exports = {
  initDatabase,
  saveDatabase,
  run,
  get,
  all,
  db: () => db
};
