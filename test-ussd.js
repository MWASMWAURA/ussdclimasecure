/**
 * ClimaSecure USSD Test Script
 * Tests the USSD menu locally without needing Africa's Talking
 * 
 * Usage: node test-ussd.js
 */

const { initDatabase } = require('./src/db');

async function testMenu() {
  // Initialize database first
  console.log('Initializing database...');
  await initDatabase();
  console.log('Database initialized.\n');
  
  const { processUssdRequest } = require('./src/ussd/menuHandler');
  const testPhone = '254712345678';
  
  console.log('=== ClimaSecure USSD Menu Test ===\n');
  
  // Test 1: Root menu (empty text)
  console.log('--- Test 1: Root Menu ---');
  let response = await processUssdRequest(testPhone, '');
  console.log(response);
  console.log('\n');
  
  // Test 2: Select Register option
  console.log('--- Test 2: Select Register (send "1") ---');
  response = await processUssdRequest(testPhone, '*1#');
  console.log(response);
  console.log('\n');
  
  // Test 3: Enter National ID
  console.log('--- Test 3: Enter National ID ---');
  response = await processUssdRequest(testPhone, '*1#*12345678#');
  console.log(response);
  console.log('\n');
  
  // Test 4: Select County (Kisumu = 1)
  console.log('--- Test 4: Select County (1 = Kisumu) ---');
  response = await processUssdRequest(testPhone, '*1#*12345678#*1#');
  console.log(response);
  console.log('\n');
  
  // Test 5: Confirm registration
  console.log('--- Test 5: Confirm Registration (1 = Confirm) ---');
  response = await processUssdRequest(testPhone, '*1#*12345678#*1#*1#');
  console.log(response);
  console.log('\n');
  
  // Test 6: Check Policy
  console.log('--- Test 6: Check Policy (send "2") ---');
  response = await processUssdRequest(testPhone, '*2#');
  console.log(response);
  console.log('\n');
  
  // Test 7: Enter National ID to check policy
  console.log('--- Test 7: Check Policy with National ID ---');
  response = await processUssdRequest(testPhone, '*2#*12345678#');
  console.log(response);
  console.log('\n');
  
  // Test 8: Rainfall Update
  console.log('--- Test 8: Rainfall Update (send "3") ---');
  response = await processUssdRequest(testPhone, '*3#');
  console.log(response);
  console.log('\n');
  
  // Test 9: Select county for rainfall
  console.log('--- Test 9: Select Kisumu for rainfall ---');
  response = await processUssdRequest(testPhone, '*3#*1#');
  console.log(response);
  console.log('\n');
  
  // Test 10: Help
  console.log('--- Test 10: Help (send "5") ---');
  response = await processUssdRequest(testPhone, '*5#');
  console.log(response);
  console.log('\n');
  
  console.log('=== Tests Complete ===');
}

testMenu().catch(console.error);
