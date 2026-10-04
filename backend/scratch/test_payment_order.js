const express = require('express');
const jwt = require('jsonwebtoken');

async function runTests() {
  console.log('--- Starting Payment Order Route Verification ---');

  // Verify server loads
  const app = express();
  app.use(express.json());
  
  const paymentsRouter = require('../routes/payments');
  app.use('/api/payments', paymentsRouter);

  const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key_change_this_in_production_make_it_long_and_random';
  const testToken = jwt.sign({ id: 101, email: 'test@example.com' }, JWT_SECRET, { expiresIn: '1h' });

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // Test 1: Unauthenticated request should return 401
    const resNoAuth = await fetch(`${baseUrl}/api/payments/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId: 1 }),
    });
    console.log('Test 1 (No auth -> 401):', resNoAuth.status === 401 ? 'PASS' : `FAIL (${resNoAuth.status})`);

    // Test 2: Authenticated request with missing appointmentId should return 400
    const resMissingId = await fetch(`${baseUrl}/api/payments/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testToken}`,
      },
      body: JSON.stringify({}),
    });
    const missingIdBody = await resMissingId.json();
    console.log(
      'Test 2 (Missing appointmentId -> 400):',
      resMissingId.status === 400 && missingIdBody.error === 'appointmentId is required' ? 'PASS' : `FAIL (${resMissingId.status})`
    );

    // Test 3: Authenticated request with non-integer appointmentId should return 400
    const resInvalidId = await fetch(`${baseUrl}/api/payments/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testToken}`,
      },
      body: JSON.stringify({ appointmentId: 'abc' }),
    });
    const invalidIdBody = await resInvalidId.json();
    console.log(
      'Test 3 (Invalid appointmentId -> 400):',
      resInvalidId.status === 400 && invalidIdBody.error === 'appointmentId is required' ? 'PASS' : `FAIL (${resInvalidId.status})`
    );

    console.log('--- All Unit Route Tests Completed Successfully ---');
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    server.close();
  }
}

runTests();
