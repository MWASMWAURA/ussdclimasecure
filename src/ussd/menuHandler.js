/**
 * ClimaSecure USSD Menu Handler
 * Implements the state-aware menu system for *384#
 */

const config = require('../config');
const { FarmerModel, PolicyModel, ClaimModel, RainfallDataModel, RainfallThresholdModel } = require('../models');

/**
 * Menu States
 */
const MENU_STATE = {
  ROOT: 'root',
  REGISTER_NATIONAL_ID: 'register_national_id',
  REGISTER_COUNTY: 'register_county',
  REGISTER_COUNTY_PAGE: 'register_county_page',
  REGISTER_CONFIRM: 'register_confirm',
  CHECK_POLICY: 'check_policy',
  CHECK_POLICY_RESULT: 'check_policy_result',
  RAINFALL_UPDATE: 'rainfall_update',
  RAINFALL_COUNTY_PAGE: 'rainfall_county_page',
  PAYOUT_STATUS: 'payout_status',
  PAYOUT_STATUS_RESULT: 'payout_status_result',
  HELP: 'help'
};

/**
 * Pagination constants
 */
const COUNTIES_PER_PAGE = 10;
const NEXT_PAGE_CODE = '98';
const BACK_PAGE_CODE = '0';

/**
 * Session Manager - Manages USSD session state
 */
class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  getSession(phoneNumber) {
    if (!this.sessions.has(phoneNumber)) {
      this.sessions.set(phoneNumber, {
        state: MENU_STATE.ROOT,
        data: {},
        step: 0
      });
    }
    return this.sessions.get(phoneNumber);
  }

  updateSession(phoneNumber, state, data = {}) {
    const session = this.getSession(phoneNumber);
    session.state = state;
    session.data = { ...session.data, ...data };
    session.step += 1;
    this.sessions.set(phoneNumber, session);
    return session;
  }

  clearSession(phoneNumber) {
    this.sessions.delete(phoneNumber);
  }
}

const sessionManager = new SessionManager();

/**
 * Format phone number to standard format
 */
function formatPhoneNumber(phone) {
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
 * Generate the root menu
 */
function getRootMenu() {
  return `CON Welcome to ${config.app.name}
Protect your farm from flooding

1. Register
2. Check Policy
3. Rainfall Update
4. Payout Status
5. Help

Reply with number`;
}

/**
 * Handle registration - National ID input
 */
function getRegisterNationalIdMenu() {
  return `CON Enter your National ID number`;
}

/**
 * Handle registration - County selection (paginated)
 */
function getRegisterCountyMenu(nationalId, page = 1) {
  const counties = config.counties;
  const totalPages = Math.ceil(counties.length / COUNTIES_PER_PAGE);
  const startIndex = (page - 1) * COUNTIES_PER_PAGE;
  const endIndex = Math.min(startIndex + COUNTIES_PER_PAGE, counties.length);
  const pageCounties = counties.slice(startIndex, endIndex);
  
  let menu = `CON Select your county (Page ${page}/${totalPages}):\n`;
  
  pageCounties.forEach((county, index) => {
    const globalIndex = startIndex + index + 1;
    menu += `${globalIndex}. ${county}\n`;
  });
  
  // Add navigation options
  if (totalPages > 1) {
    menu += `\n`;
    if (page < totalPages) {
      menu += `${COUNTIES_PER_PAGE + 1}. Next >\n`;
    }
    if (page > 1) {
      menu += `${COUNTIES_PER_PAGE + 2}. < Previous\n`;
    }
  }
  
  return menu;
}

/**
 * Handle registration - Confirmation
 */
function getRegisterConfirmMenu(nationalId, county) {
  return `CON Confirm Registration:
National ID: ${nationalId}
County: ${county}

1. Confirm
2. Cancel`;
}

/**
 * Handle successful registration
 */
function getRegistrationSuccessMenu(policy) {
  return `END Welcome to ${config.app.name}!

Your registration is complete.
Policy Number: ${policy.policy_number}
Coverage: KES ${policy.coverage_amount.toLocaleString()}
Valid: ${policy.start_date} to ${policy.end_date}

Premium: KES ${config.insurance.premiumAmount}/year

You will receive payouts automatically if heavy rainfall triggers a claim in your county.

Dial *384# to access services.`;
}

/**
 * Handle check policy
 */
function getCheckPolicyMenu() {
  return `CON Enter your National ID number to check your policy:`;
}

/**
 * Handle check policy result
 */
function getCheckPolicyResult(farmer, policy) {
  if (!farmer || !policy) {
    return `END Policy not found.
    
No policy found for the provided National ID. Please register first.`;
  }

  const statusEmoji = policy.status === 'active' ? '✅' : '❌';
  
  return `END Your ${config.app.name} Policy:

Policy #: ${policy.policy_number}
Status: ${statusEmoji} ${policy.status.toUpperCase()}
County: ${farmer.county}
Coverage: KES ${policy.coverage_amount.toLocaleString()}
Premium Paid: KES ${policy.premium_paid}
Valid From: ${policy.start_date}
Valid Until: ${policy.end_date}

Dial *384# for menu.`;
}

/**
 * Handle rainfall update - county selection (paginated)
 */
function getRainfallUpdateMenu(page = 1) {
  const counties = config.counties;
  const totalPages = Math.ceil(counties.length / COUNTIES_PER_PAGE);
  const startIndex = (page - 1) * COUNTIES_PER_PAGE;
  const endIndex = Math.min(startIndex + COUNTIES_PER_PAGE, counties.length);
  const pageCounties = counties.slice(startIndex, endIndex);
  
  let menu = `CON Select county for rainfall info (Page ${page}/${totalPages}):\n`;
  
  pageCounties.forEach((county, index) => {
    const globalIndex = startIndex + index + 1;
    menu += `${globalIndex}. ${county}\n`;
  });
  
  // Add navigation options
  if (totalPages > 1) {
    menu += `\n`;
    if (page < totalPages) {
      menu += `${COUNTIES_PER_PAGE + 1}. Next >\n`;
    }
    if (page > 1) {
      menu += `${COUNTIES_PER_PAGE + 2}. < Previous\n`;
    }
  }
  
  return menu;
}

/**
 * Handle rainfall update - result
 */
function getRainfallUpdateResult(county) {
  const threshold = RainfallThresholdModel.getByCounty(county);
  const recentData = RainfallDataModel.getRecentByCounty(county, 7);
  
  let message = `END Rainfall Update for ${county}:\n\n`;
  
  if (threshold) {
    message += `Trigger Threshold (90th percentile): ${threshold.percentile_90}mm\n`;
    message += `Severe Threshold (95th percentile): ${threshold.percentile_95}mm\n\n`;
  }
  
  if (recentData && recentData.length > 0) {
    message += `Recent Readings:\n`;
    recentData.forEach(data => {
      const triggerWarning = threshold && data.rainfall_mm >= threshold.percentile_90 ? ' ⚠️ TRIGGER' : '';
      message += `${data.date}: ${data.rainfall_mm}mm${triggerWarning}\n`;
    });
  } else {
    message += `No recent rainfall data available.`;
  }
  
  return message;
}

/**
 * Handle payout status - county selection
 */
function getPayoutStatusMenu() {
  return `CON Enter your National ID to check payout status:`;
}

/**
 * Handle payout status - result
 */
function getPayoutStatusResult(nationalId) {
  const farmer = FarmerModel.findByNationalId(nationalId);
  
  if (!farmer) {
    return `END Farmer not found.
    
No registration found for this National ID.`;
  }
  
  const claims = ClaimModel.findByFarmerId(farmer.id);
  
  let message = `END Payout Status:\n\n`;
  
  if (!claims || claims.length === 0) {
    message += `No claims or payouts on record.
    
Your account is in good standing.`;
  } else {
    claims.forEach(claim => {
      const statusIcon = claim.payout_status === 'paid' ? '✅' : claim.payout_status === 'pending' ? '⏳' : '❌';
      message += `Claim: ${claim.claim_number}\n`;
      message += `Date: ${claim.event_date}\n`;
      message += `Event: ${claim.event_type}\n`;
      message += `Rainfall: ${claim.rainfall_mm}mm (${claim.trigger_percentile}th percentile)\n`;
      message += `Amount: KES ${claim.amount_approved.toLocaleString()}\n`;
      message += `Status: ${statusIcon} ${claim.payout_status.toUpperCase()}\n`;
      if (claim.payout_reference) {
        message += `Ref: ${claim.payout_reference}\n`;
      }
      message += `\n`;
    });
  }
  
  return message;
}

/**
 * Handle help menu
 */
function getHelpMenu() {
  return `END ${config.app.name} Help:

1. REGISTER: Create your policy using your National ID and county.

2. CHECK POLICY: View your policy details and status.

3. RAINFALL UPDATE: Check current rainfall levels in your county and trigger thresholds.

4. PAYOUT STATUS: Check if you've received any automatic payouts.

COVERAGE:
- Automatic payout when rainfall exceeds 90th percentile in your county
- Payout: KES ${config.insurance.payoutAmount.toLocaleString()}
- Premium: KES ${config.insurance.premiumAmount}/year

For support, contact:
Email: support@climasecure.ke
Dial *384# for menu.`;
}

/**
 * Process USSD request
 */
async function processUssdRequest(phoneNumber, text) {
  const formattedPhone = formatPhoneNumber(phoneNumber);
  const session = sessionManager.getSession(formattedPhone);
  
  // Parse input - Africa's Talking sends text like "*1#*123#" or just "1"
  // We need to handle both formats
  let currentInput = text;
  
  // If text contains asterisks, extract the last part between asterisks
  if (text.includes('*')) {
    const parts = text.split('*').filter(item => item !== '');
    // Remove trailing # from the last part if present
    currentInput = parts[parts.length - 1].replace(/#$/, '');
  } else {
    // Just remove trailing # if present
    currentInput = text.replace(/#$/, '');
  }
  
  console.log(`USSD Request - Phone: ${formattedPhone}, Session: ${session.state}, Input: "${currentInput}", Raw: "${text}"`);
  
  try {
    switch (session.state) {
      case MENU_STATE.ROOT:
        return handleRootMenu(formattedPhone, currentInput);
        
      case MENU_STATE.REGISTER_NATIONAL_ID:
        return handleRegisterNationalId(formattedPhone, currentInput);
        
      case MENU_STATE.REGISTER_COUNTY:
      case MENU_STATE.REGISTER_COUNTY_PAGE:
        return handleRegisterCounty(formattedPhone, currentInput);
        
      case MENU_STATE.REGISTER_CONFIRM:
        return handleRegisterConfirm(formattedPhone, currentInput);
        
      case MENU_STATE.CHECK_POLICY:
        return handleCheckPolicy(formattedPhone, currentInput);
        
      case MENU_STATE.RAINFALL_UPDATE:
      case MENU_STATE.RAINFALL_COUNTY_PAGE:
        return handleRainfallUpdate(formattedPhone, currentInput);
        
      case MENU_STATE.PAYOUT_STATUS:
        return handlePayoutStatus(formattedPhone, currentInput);
        
      case MENU_STATE.HELP:
        sessionManager.clearSession(formattedPhone);
        return getHelpMenu();
        
      default:
        sessionManager.clearSession(formattedPhone);
        return getRootMenu();
    }
  } catch (error) {
    console.error('USSD Error:', error);
    sessionManager.clearSession(formattedPhone);
    return `END An error occurred. Please try again later.`;
  }
}

/**
 * Handle root menu input
 */
function handleRootMenu(phone, input) {
  switch (input) {
    case '1':
      // Register
      sessionManager.updateSession(phone, MENU_STATE.REGISTER_NATIONAL_ID);
      return getRegisterNationalIdMenu();
      
    case '2':
      // Check Policy
      sessionManager.updateSession(phone, MENU_STATE.CHECK_POLICY);
      return getCheckPolicyMenu();
      
    case '3':
      // Rainfall Update
      sessionManager.updateSession(phone, MENU_STATE.RAINFALL_UPDATE, { rainfallPage: 1 });
      return getRainfallUpdateMenu(1);
      
    case '4':
      // Payout Status
      sessionManager.updateSession(phone, MENU_STATE.PAYOUT_STATUS);
      return getPayoutStatusMenu();
      
    case '5':
      // Help
      sessionManager.updateSession(phone, MENU_STATE.HELP);
      return getHelpMenu();
      
    default:
      return getRootMenu();
  }
}

/**
 * Handle registration - National ID
 */
function handleRegisterNationalId(phone, input) {
  if (!input || input.length < 5) {
    return `CON Invalid National ID. Please enter a valid ID number (at least 5 digits):`;
  }
  
  // Check if already registered
  const existingFarmer = FarmerModel.findByNationalId(input);
  if (existingFarmer) {
    const policy = PolicyModel.findByFarmerId(existingFarmer.id);
    sessionManager.clearSession(phone);
    return getCheckPolicyResult(existingFarmer, policy);
  }
  
  sessionManager.updateSession(phone, MENU_STATE.REGISTER_COUNTY, { 
    nationalId: input,
    countyPage: 1 
  });
  return getRegisterCountyMenu(input, 1);
}

/**
 * Handle registration - County selection with pagination
 */
function handleRegisterCounty(phone, input) {
  const counties = config.counties;
  const totalPages = Math.ceil(counties.length / COUNTIES_PER_PAGE);
  const session = sessionManager.getSession(phone);
  const currentPage = session.data.countyPage || 1;
  const startIndex = (currentPage - 1) * COUNTIES_PER_PAGE;
  const endIndex = Math.min(startIndex + COUNTIES_PER_PAGE, counties.length);
  
  const inputNum = parseInt(input);
  
  // Handle page navigation
  if (input === NEXT_PAGE_CODE && currentPage < totalPages) {
    // Next page
    const newPage = currentPage + 1;
    sessionManager.updateSession(phone, MENU_STATE.REGISTER_COUNTY_PAGE, { 
      nationalId: session.data.nationalId,
      countyPage: newPage 
    });
    return getRegisterCountyMenu(session.data.nationalId, newPage);
  }
  
  if (input === BACK_PAGE_CODE && currentPage > 1) {
    // Previous page
    const newPage = currentPage - 1;
    sessionManager.updateSession(phone, MENU_STATE.REGISTER_COUNTY_PAGE, { 
      nationalId: session.data.nationalId,
      countyPage: newPage 
    });
    return getRegisterCountyMenu(session.data.nationalId, newPage);
  }
  
  // Handle county selection
  const countyIndex = inputNum - 1;
  
  if (isNaN(countyIndex) || countyIndex < 0 || countyIndex >= counties.length) {
    return `CON Invalid selection. Please enter a number between 1 and ${counties.length}:`;
  }
  
  const county = counties[countyIndex];
  sessionManager.updateSession(phone, MENU_STATE.REGISTER_CONFIRM, { 
    nationalId: session.data.nationalId,
    county: county
  });
  
  return getRegisterConfirmMenu(session.data.nationalId, county);
}

/**
 * Handle registration - Confirmation
 */
async function handleRegisterConfirm(phone, input) {
  const session = sessionManager.getSession(phone);
  
  if (input === '2') {
    // Cancel
    sessionManager.clearSession(phone);
    return `END Registration cancelled. Dial *384# to start again.`;
  }
  
  if (input !== '1') {
    return `CON Invalid option. Enter 1 to confirm or 2 to cancel:`;
  }
  
  // Create farmer
  const farmer = FarmerModel.create(phone, session.data.nationalId, session.data.county);
  
  // Create policy
  const policy = PolicyModel.create(farmer.id, config.insurance.premiumAmount);
  
  sessionManager.clearSession(phone);
  
  return getRegistrationSuccessMenu(policy);
}

/**
 * Handle check policy
 */
function handleCheckPolicy(phone, input) {
  if (!input || input.length < 5) {
    return `CON Invalid National ID. Please enter a valid ID number:`;
  }
  
  const farmer = FarmerModel.findByNationalId(input);
  const policy = farmer ? PolicyModel.findByFarmerId(farmer.id) : null;
  
  sessionManager.clearSession(phone);
  
  return getCheckPolicyResult(farmer, policy);
}

/**
 * Handle rainfall update - county selection with pagination
 */
function handleRainfallUpdate(phone, input) {
  const counties = config.counties;
  const totalPages = Math.ceil(counties.length / COUNTIES_PER_PAGE);
  const session = sessionManager.getSession(phone);
  const currentPage = session.data.rainfallPage || 1;
  const startIndex = (currentPage - 1) * COUNTIES_PER_PAGE;
  const endIndex = Math.min(startIndex + COUNTIES_PER_PAGE, counties.length);
  
  const inputNum = parseInt(input);
  
  // Handle page navigation
  if (input === NEXT_PAGE_CODE && currentPage < totalPages) {
    // Next page
    const newPage = currentPage + 1;
    sessionManager.updateSession(phone, MENU_STATE.RAINFALL_COUNTY_PAGE, { 
      rainfallPage: newPage 
    });
    return getRainfallUpdateMenu(newPage);
  }
  
  if (input === BACK_PAGE_CODE && currentPage > 1) {
    // Previous page
    const newPage = currentPage - 1;
    sessionManager.updateSession(phone, MENU_STATE.RAINFALL_COUNTY_PAGE, { 
      rainfallPage: newPage 
    });
    return getRainfallUpdateMenu(newPage);
  }
  
  // Handle county selection
  const countyIndex = inputNum - 1;
  
  if (isNaN(countyIndex) || countyIndex < 0 || countyIndex >= counties.length) {
    return `CON Invalid selection. Please enter a number between 1 and ${counties.length}:`;
  }
  
  const county = counties[countyIndex];
  sessionManager.clearSession(phone);
  
  return getRainfallUpdateResult(county);
}

/**
 * Handle payout status
 */
function handlePayoutStatus(phone, input) {
  if (!input || input.length < 5) {
    return `CON Invalid National ID. Please enter a valid ID number:`;
  }
  
  sessionManager.clearSession(phone);
  
  return getPayoutStatusResult(input);
}

module.exports = {
  processUssdRequest,
  sessionManager,
  MENU_STATE
};
