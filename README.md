# ClimaSecure

USSD-based climate microinsurance platform for smallholder farmers in Kenya.

## Overview

ClimaSecure is a digital microinsurance platform designed to protect smallholder farmers in Kenya from the financial devastation caused by extreme rainfall and flooding. The platform uses satellite-based parametric triggers to automatically detect and pay out claims when rainfall exceeds historical thresholds.

## Features

### USSD-Based Access
- Simple USSD code: `*318#`
- Works on basic "feature phones" without internet
- Registration, premium payment, and policy status checks via USSD

### Parametric (Index) Triggers
- Automated claim detection using satellite rainfall data
- Triggers at the 90th percentile of historical rainfall data
- No need for physical damage verification

### Automated M-Pesa Payouts
- Direct cash transfers to farmers' mobile money accounts
- Automatic payout processing when triggers are activated

### Recovery Kits
- Post-disaster support with certified seeds and poultry
- Helps farmers restart agricultural activities

## USSD Menu

### Root Menu
```
Welcome to ClimaSecure
Protect your farm from flooding

1. Register
2. Check Policy
3. Rainfall Update
4. Payout Status
5. Help
```

### Registration Flow
1. Enter National ID number
2. Select county from list
3. Confirm registration details

## Project Structure

```
src/
├── config/         # Configuration management
├── db/            # Database initialization and SQLite
├── models/        # Data access layer
├── services/      # Business logic (M-Pesa, Triggers)
├── ussd/          # USSD menu handler and Africa's Talking
├── routes/        # REST API endpoints
└── index.js       # Application entry point
```

## Installation

```bash
# Install dependencies
npm install

# Copy environment file and configure
cp .env.example .env

# Start the server
npm start
```

## Configuration

Edit `.env` file with your credentials:

```env
# Africa's Talking
AFRICASTALKING_USERNAME=sandbox
AFRICASTALKING_API_KEY=your_api_key
AFRICASTALKING_USSD_SHORTCODE=*318#

# M-Pesa (Daraja API)
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_SHORTCODE=600000
MPESA_PASSKEY=your_passkey

# Insurance Settings
PREMIUM_AMOUNT_KES=500
PAYOUT_AMOUNT_KES=10000
RAINFALL_TRIGGER_PERCENTILE=90
```

## API Endpoints

### Farmers
- `GET /api/farmers` - List all farmers
- `POST /api/farmers` - Register farmer
- `GET /api/farmers/:id` - Get farmer by ID

### Policies
- `GET /api/policies` - List all policies
- `GET /api/policies/:id` - Get policy details
- `GET /api/policies/farmer/:farmerId` - Get policy by farmer

### Claims
- `GET /api/claims` - List all claims
- `POST /api/claims` - Create claim (manual)
- `POST /api/claims/:id/approve` - Approve claim
- `POST /api/claims/:id/reject` - Reject claim

### Rainfall & Triggers
- `GET /api/thresholds` - Get rainfall thresholds
- `POST /api/rainfall` - Add rainfall data
- `GET /api/triggers/status` - Get trigger status
- `POST /api/triggers/check` - Manual trigger check

### Statistics
- `GET /api/stats` - Dashboard statistics

## Supported Counties

Kisumu, Tana River, Homa Bay, Migori, Siaya, Busia, Kakamega, Vihiga, Bungoma, Nandi, Kisii, Nyamira, Mombasa, Kilifi, Lamu, Taita Taveta, Nairobi, Kiambu, Nakuru, Uasin Gishu

## Testing

```bash
# Run the server
npm start

# Test USSD endpoint with curl
curl -X POST http://localhost:3000/ussd \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "phoneNumber=254712345678&text="
```

## License

MIT
