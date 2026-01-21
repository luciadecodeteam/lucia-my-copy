// backend/test-scribe.js
const { updateMemory } = require('./src/lib/memory');

async function testScribe() {
  console.log('--- Starting Scribe Test ---');

  // This test will fail if you haven't set up your local environment variables.
  // You need AWS credentials that can assume the lucia-gcp-federation-role
  // and you need GCP_PROJECT_ID.
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.GCP_PROJECT_ID) {
    console.error(`
[ERROR] Environment variables are not set.
Please make sure you have the following variables in your environment:
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- AWS_SESSION_TOKEN (if using temporary credentials)
- GCP_PROJECT_ID
- GCP_REGION (defaults to us-central1)
- AWS_ROLE_ARN with value arn:aws:iam::406682759576:role/lucia-gcp-federation-role
- AWS_WEB_IDENTITY_TOKEN_FILE which should point to a valid web identity token file.
`);
    process.exit(1);
  }

  const testUserId = 'local-test-user-123';
  const sampleConversation = [
    { role: 'user', content: 'Hi, can you remember my name is Alex?' },
    { role: 'assistant', content: 'Of course, I will remember that your name is Alex.' }
  ];
  const existingSummary = 'The user has not shared any personal information yet.';

  console.log('Calling the Scribe (updateMemory) with sample data...');
  console.log('This may take a few moments...');

  try {
    // We are calling updateMemory directly to test the connection to Vertex AI.
    // In the real app, this happens in the background.
    await updateMemory(testUserId, sampleConversation, existingSummary, true); // Using isDemo=true to write to a safe collection

    console.log(`
✅ --- Scribe Test Successful! ---
A summary has been written to the 'demo_sessions' collection in Firestore for the user ID '${testUserId}'.
You can verify this by checking your Firestore database.
This confirms that the connection to Google Cloud Vertex AI is working correctly from your local machine.
`);
  } catch (error) {
    console.error('\n❌ --- Scribe Test Failed ---');
    console.error('An error occurred while trying to update memory:');
    console.error(error);
    console.error(`
[TROUBLESHOOTING]
1.  Verify that your AWS credentials are correct and have permissions to assume the role specified in AWS_ROLE_ARN.
2.  Verify that the GCP_PROJECT_ID is correct.
3.  Check the "Workload Identity Federation" setup in your Google Cloud project to ensure it trusts the AWS role.
`);
  }
}

testScribe();
