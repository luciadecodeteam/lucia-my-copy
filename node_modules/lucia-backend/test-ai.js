const { callAI } = require('./src/lib/ai');

async function test() {
  console.log('--- Starting AI Connection Test ---');
  console.log('Target URL: https://acmjtgoc47eieiii6gksw3bx6u0feemy.lambda-url.eu-west-1.on.aws/');
  
  try {
    console.log('Sending message: "Hello! Who are you?"...');
    const response = await callAI('Hello! Who are you?');
    console.log('\n✅ SUCCESS! AI Response:');
    console.log('------------------------');
    console.log(response);
    console.log('------------------------');
  } catch (err) {
    console.error('\n❌ FAILED! Error details:');
    console.error(err.message);
    console.log('\nTIP: Make sure you have an internet connection and the Lambda URL is correct.');
  }
}

test();
