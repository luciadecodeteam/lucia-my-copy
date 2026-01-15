const axios = require('axios');

async function debug() {
  try {
    await axios.post('https://acmjtgoc47eieiii6gksw3bx6u0feemy.lambda-url.eu-west-1.on.aws/', {
      mode: 'chat',
      messages: [{ role: 'user', content: 'Hello' }]
    });
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

debug();
