/**
 * ClimaSecure Configuration
 * Loads environment variables and provides application configuration
 */

require('dotenv').config();

module.exports = {
  // Server Configuration
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Africa's Talking Configuration
  africaTalking: {
    username: process.env.AFRICASTALKING_USERNAME || 'sandbox',
    apiKey: process.env.AFRICASTALKING_API_KEY || '',
    ussdShortCode: process.env.AFRICASTALKING_USSD_SHORTCODE || '*384#'
  },

  // M-Pesa Configuration
  mpesa: {
    consumerKey: process.env.MPESA_CONSUMER_KEY || '',
    consumerSecret: process.env.MPESA_CONSUMER_SECRET || '',
    shortCode: process.env.MPESA_SHORTCODE || '600000',
    passkey: process.env.MPESA_PASSKEY || '',
    securityCredential: process.env.MPESA_SECURITY_CREDENTIAL || '',
    env: process.env.MPESA_ENV || 'sandbox',
    callbackUrl: process.env.MPESA_CALLBACK_URL || ''
  },

  // Application Settings
  app: {
    name: process.env.APP_NAME || 'ClimaSecure',
    url: process.env.APP_URL || 'http://localhost:3000'
  },

  // Insurance Settings
  insurance: {
    premiumAmount: parseInt(process.env.PREMIUM_AMOUNT_KES) || 500,
    payoutAmount: parseInt(process.env.PAYOUT_AMOUNT_KES) || 10000,
    rainfallTriggerPercentile: parseInt(process.env.RAINFALL_TRIGGER_PERCENTILE) || 90
  },

  // Database
  db: {
    path: process.env.DB_PATH || './data/climasecure.db',
    mongoUri: process.env.MONGODB_URI || ''
  },

  // Kenya Counties supported by ClimaSecure
  counties: [
    'Kisumu',
    'Tana River',
    'Homa Bay',
    'Migori',
    'Siaya',
    'Busia',
    'Kakamega',
    'Vihiga',
    'Bungoma',
    'Nandi',
    'Kisii',
    'Nyamira',
    'Mombasa',
    'Kilifi',
    'Lamu',
    'Taita Taveta',
    'Nairobi',
    'Kiambu',
    'Nakuru',
    'Uasin Gishu'
  ]
};
