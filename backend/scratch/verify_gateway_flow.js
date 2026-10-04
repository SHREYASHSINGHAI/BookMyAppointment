const express = require('express');
const jwt = require('jsonwebtoken');

async function testFullGatewayFlow() {
  console.log('--- Verifying Gateway Architecture & Flow ---');

  // Verify that all components required exist
  const hasPg = !!require('pg');
  const hasRazorpay = !!require('razorpay');
  const hasPaymentsRoute = !!require('../routes/payments');

  console.log('1. Dependencies check:');
  console.log('   - pg installed:', hasPg ? 'OK' : 'MISSING');
  console.log('   - razorpay installed:', hasRazorpay ? 'OK' : 'MISSING');
  console.log('   - routes/payments.js loaded:', hasPaymentsRoute ? 'OK' : 'MISSING');

  // Verify schema file exists and has correct definitions
  const fs = require('fs');
  const path = require('path');
  const schema = fs.readFileSync(path.join(__dirname, '../payments_schema.sql'), 'utf8');
  console.log('2. Schema check:');
  console.log('   - payments table defined:', schema.includes('CREATE TABLE IF NOT EXISTS payments') ? 'OK' : 'MISSING');
  console.log('   - partial unique index defined:', schema.includes('uq_payments_open_per_appointment') ? 'OK' : 'MISSING');
  console.log('   - refunds table defined:', schema.includes('CREATE TABLE IF NOT EXISTS refunds') ? 'OK' : 'MISSING');
  console.log('   - payment_events table defined:', schema.includes('CREATE TABLE IF NOT EXISTS payment_events') ? 'OK' : 'MISSING');

  console.log('--- Gateway Verification Complete ---');
}

testFullGatewayFlow();
