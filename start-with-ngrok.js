/**
 * ClimaSecure Startup with ngrok
 * This script starts ngrok and the server together
 * 
 * Usage: node start-with-ngrok.js
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🌾 ClimaSecure - Starting with ngrok                      ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

Instructions:
1. This script will start ngrok to create a public URL
2. Copy the "Forwarding" URL from ngrok (e.g., https://abc123.ngrok.io)
3. Update your .env file with MPESA_CALLBACK_URL
4. Register the URL in Safaricom Developer Portal
5. Press Ctrl+C to stop both services

Starting ngrok tunnel on port 3000...
`);

// Start ngrok
const ngrok = exec('ngrok http 3000');

ngrok.stdout.on('data', (data) => {
  const output = data.toString();
  console.log(output);
  
  // Check for the forwarding URL
  if (output.includes('https://') && output.includes('.ngrok.io')) {
    const match = output.match(/https:\/\/[a-z0-9]+\.ngrok\.io/);
    if (match) {
      const url = match[0];
      console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  YOUR PUBLIC URL: ${url}                    ║
╚═══════════════════════════════════════════════════════════════╝

NEXT STEPS:
1. Copy this URL
2. Update your .env file:
   MPESA_CALLBACK_URL=${url}/mpesa/callback
3. Restart the server
4. Register this URL in Safaricom Developer Portal

Note: ngrok URL changes each time you restart. For production,
use a static domain or deploy to a live server.
`);
    }
  }
});

ngrok.stderr.on('data', (data) => {
  console.error('ngrok error:', data.toString());
});

process.on('SIGINT', () => {
  console.log('\nStopping ngrok...');
  ngrok.kill();
  process.exit(0);
});
