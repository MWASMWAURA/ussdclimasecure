/**
 * ClimaSecure M-Pesa Service
 * Handles mobile money payments via Safaricom Daraja API
 */

const config = require('../config');

// M-Pesa API endpoints
const MPESA_ENDPOINTS = {
  sandbox: {
    auth: 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    stkPush: 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
    stkQuery: 'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query',
    b2c: 'https://sandbox.safaricom.co.ke/mpesa/b2c/v1/paymentrequest',
    c2bRegister: 'https://sandbox.safaricom.co.ke/mpesa/c2b/v1/registerurl',
    c2bSimulate: 'https://sandbox.safaricom.co.ke/mpesa/c2b/v1/simulate'
  },
  production: {
    auth: 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    stkPush: 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
    stkQuery: 'https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query',
    b2c: 'https://api.safaricom.co.ke/mpesa/b2c/v1/paymentrequest',
    c2bRegister: 'https://api.safaricom.co.ke/mpesa/c2b/v1/registerurl',
    c2bSimulate: 'https://api.safaricom.co.ke/mpesa/c2b/v1/simulate'
  }
};

// Token cache
let accessToken = null;
let tokenExpiry = null;

/**
 * Get M-Pesa API base URL based on environment
 */
function getApiBase() {
  return MPESA_ENDPOINTS[config.mpesa.env] || MPESA_ENDPOINTS.sandbox;
}

/**
 * Generate base64 credentials
 */
function getCredentials() {
  const credentials = `${config.mpesa.consumerKey}:${config.mpesa.consumerSecret}`;
  return Buffer.from(credentials).toString('base64');
}

/**
 * Get access token from M-Pesa API
 */
async function getAccessToken() {
  // Return cached token if still valid
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  try {
    const response = await fetch(getApiBase().auth, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${getCredentials()}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Auth failed: ${response.status}`);
    }

    const data = await response.json();
    
    // Cache token (expires in 55 minutes to be safe)
    accessToken = data.access_token;
    tokenExpiry = Date.now() + (55 * 60 * 1000);
    
    return accessToken;
  } catch (error) {
    console.error('M-Pesa Auth Error:', error);
    throw error;
  }
}

/**
 * Generate STK Push password
 */
function generatePassword() {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').substring(0, 14);
  const data = `${config.mpesa.shortCode}${config.mpesa.passkey}${timestamp}`;
  return {
    password: Buffer.from(data).toString('base64'),
    timestamp
  };
}

/**
 * Send STK Push payment request to customer
 */
async function sendStkPush(phoneNumber, amount, callbackUrl = null) {
  try {
    const token = await getAccessToken();
    const { password, timestamp } = generatePassword();
    
    const payload = {
      BusinessShortCode: config.mpesa.shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(amount),
      PartyA: phoneNumber,
      PartyB: config.mpesa.shortCode,
      PhoneNumber: phoneNumber,
      CallBackURL: callbackUrl || config.mpesa.callbackUrl || `${config.app.url}/mpesa/callback`,
      AccountReference: 'ClimaSecure',
      TransactionDesc: 'ClimaSecure Premium Payment'
    };

    const response = await fetch(getApiBase().stkPush, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    
    if (data.ResponseCode === '0') {
      return {
        success: true,
        checkoutRequestId: data.CheckoutRequestID,
        response: data
      };
    } else {
      return {
        success: false,
        error: data.ResponseDescription,
        response: data
      };
    }
  } catch (error) {
    console.error('STK Push Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Query STK Push payment status
 */
async function queryStkPush(checkoutRequestId) {
  try {
    const token = await getAccessToken();
    const { password, timestamp } = generatePassword();

    const payload = {
      BusinessShortCode: config.mpesa.shortCode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId
    };

    const response = await fetch(getApiBase().stkQuery, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    return await response.json();
  } catch (error) {
    console.error('STK Query Error:', error);
    throw error;
  }
}

/**
 * Send Business to Customer (B2C) payment
 * Used for sending claim payouts to farmers
 */
async function sendB2CPayment(phoneNumber, amount, remarks = 'ClimaSecure Payout') {
  try {
    const token = await getAccessToken();

    const payload = {
      InitiatorName: 'ClimaSecure',
      SecurityCredential: config.mpesa.securityCredential || '',
      CommandID: 'BusinessPayment',
      Amount: Math.round(amount),
      PartyA: config.mpesa.shortCode,
      PartyB: phoneNumber,
      Remarks: remarks,
      QueueTimeOutURL: config.mpesa.callbackUrl || `${config.app.url}/mpesa/timeout`,
      ResultURL: config.mpesa.callbackUrl || `${config.app.url}/mpesa/result`,
      Occasion: 'Claim Payout'
    };

    const response = await fetch(getApiBase().b2c, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    
    if (data.ResponseCode === '0') {
      return {
        success: true,
        conversationId: data.ConversationID,
        originatorConversationId: data.OriginatorConversationID,
        response: data
      };
    } else {
      return {
        success: false,
        error: data.ResponseDescription,
        response: data
      };
    }
  } catch (error) {
    console.error('B2C Payment Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Simulate C2B payment (for testing)
 */
async function simulateC2BPayment(phoneNumber, amount, billRefNumber = 'ClimaSecure') {
  try {
    const token = await getAccessToken();

    const payload = {
      ShortCode: config.mpesa.shortCode,
      CommandID: 'CustomerBuyGoodsOnline',
      Amount: Math.round(amount),
      Msisdn: phoneNumber,
      BillRefNumber: billRefNumber
    };

    const response = await fetch(getApiBase().c2bSimulate, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    return await response.json();
  } catch (error) {
    console.error('C2B Simulate Error:', error);
    throw error;
  }
}

/**
 * Process payment result from M-Pesa
 */
function processPaymentResult(result) {
  const { ResultCode, ResultDesc, CallbackMetadata } = result;
  
  if (ResultCode === 0) {
    // Extract transaction details
    const metadata = {};
    if (CallbackMetadata && CallbackMetadata.Item) {
      CallbackMetadata.Item.forEach(item => {
        metadata[item.Name] = item.Value;
      });
    }
    
    return {
      success: true,
      transactionId: metadata.TransactionID,
      amount: metadata.Amount,
      phoneNumber: metadata_MSISDN || metadata.PhoneNumber,
      accountReference: metadata.AccountReference,
      transactionDate: metadata.TransactionDate
    };
  } else {
    return {
      success: false,
      error: ResultDesc,
      code: ResultCode
    };
  }
}

module.exports = {
  getAccessToken,
  sendStkPush,
  queryStkPush,
  sendB2CPayment,
  simulateC2BPayment,
  processPaymentResult
};
