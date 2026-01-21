const axios = require('axios');

async function debugStripe() {
  console.log('Testing Stripe Checkout Lambda...');
  try {
    // We send a fake price ID just to trigger the "price retrieval" logic
    // If it fails with "secrets_error", we know it's permissions.
    // If it fails with "No such price", we know connection is GOOD.
    const response = await axios.post('https://lt2masjrrscsh556e35szjp4u40yaifr.lambda-url.eu-west-1.on.aws/', {
      price: 'price_fake_123', 
      quantity: 1
    });
    console.log('Success (Unexpected):', response.data);
  } catch (err) {
    if (err.response) {
      console.log('--- REMOTE ERROR DETAILS ---');
      console.log('Status:', err.response.status);
      console.log('Body:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.log('Network Error:', err.message);
    }
  }
}

debugStripe();
