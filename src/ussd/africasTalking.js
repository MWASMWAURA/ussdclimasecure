/**
 * ClimaSecure Africa's Talking USSD Handler
 * Receives USSD requests from Africa's Talking and processes them
 */

const express = require('express');
const { processUssdRequest } = require('./menuHandler');
const config = require('../config');

// Initialize Africa's Talking SDK
let atClient = null;

function getAfricaTalkingClient() {
  if (!atClient) {
    try {
      const at = require('africastalking');
      atClient = at({
        username: config.africaTalking.username,
        apiKey: config.africaTalking.apiKey
      });
    } catch (error) {
      console.error('Failed to initialize Africa\'s Talking SDK:', error);
    }
  }
  return atClient;
}

/**
 * Handle incoming USSD request from Africa's Talking
 */
async function handleUssdRequest(req, res) {
  try {
    // Extract USSD parameters from Africa's Talking callback
    const { sessionId, phoneNumber, text, networkCode, serviceCode } = req.body;
    
    console.log(`USSD Callback - Session: ${sessionId}, Phone: ${phoneNumber}, Text: ${text}`);
    
    // Process the USSD request
    const response = await processUssdRequest(phoneNumber, text);
    
    // Send response to Africa's Talking
    res.set('Content-Type', 'text/plain');
    res.send(response);
    
  } catch (error) {
    console.error('USSD Handler Error:', error);
    res.set('Content-Type', 'text/plain');
    res.send('END An error occurred. Please try again later.');
  }
}

/**
 * Start USSD service using Africa's Talking SDK
 */
async function startUssdService() {
  const client = getAfricaTalkingClient();
  
  if (!client) {
    console.warn('Africa\'s Talking SDK not initialized. USSD service will not start.');
    return;
  }
  
  try {
    const ussd = client.ussd;
    
    // For Africa's Talking, we need to set up a webhook callback URL
    // The actual USSD handling is done via the callback endpoint
    console.log('USSD service configured');
    console.log(`USSD Short Code: ${config.africaTalking.ussdShortCode}`);
    console.log(`Callback URL should be set in Africa's Talking dashboard`);
    
    return ussd;
  } catch (error) {
    console.error('Failed to start USSD service:', error);
    throw error;
  }
}

/**
 * Format phone number for Africa's Talking
 */
function formatPhoneForAT(phone) {
  // Remove any non-digit characters
  let cleaned = phone.replace(/\D/g, '');
  
  // If starts with 0, replace with 254
  if (cleaned.startsWith('0')) {
    cleaned = '254' + cleaned.substring(1);
  }
  
  // If doesn't start with 254, add it
  if (!cleaned.startsWith('254')) {
    cleaned = '254' + cleaned;
  }
  
  return cleaned;
}

/**
 * Send USSD push notification (for alerts)
 */
async function sendUssdPush(phoneNumber, message) {
  const client = getAfricaTalkingClient();
  
  if (!client) {
    console.warn('Africa\'s Talking SDK not initialized');
    return { success: false, error: 'SDK not initialized' };
  }
  
  try {
    const formattedPhone = formatPhoneForAT(phoneNumber);
    
    // Note: USSD push requires special configuration
    // This is a placeholder for advanced functionality
    console.log(`USSD Push to ${formattedPhone}: ${message}`);
    
    return { success: true };
  } catch (error) {
    console.error('USSD Push Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send SMS notification
 */
async function sendSms(phoneNumber, message) {
  const client = getAfricaTalkingClient();
  
  if (!client) {
    console.warn('Africa\'s Talking SDK not initialized');
    return { success: false, error: 'SDK not initialized' };
  }
  
  try {
    // Check if SMS service is available
    if (!client.sms) {
      console.warn('Africa\'s Talking SMS service not available');
      return { success: false, error: 'SMS service not available' };
    }
    
    const formattedPhone = formatPhoneForAT(phoneNumber);
    
    const result = await client.sms.send({
      to: [formattedPhone],
      message: message,
      from: 'CLIMASEC'
    });
    
    console.log('SMS sent:', result);
    return { success: true, result };
  } catch (error) {
    console.error('SMS Error:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  handleUssdRequest,
  startUssdService,
  sendUssdPush,
  sendSms,
  formatPhoneForAT
};
