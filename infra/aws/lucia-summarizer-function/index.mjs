
import admin from 'firebase-admin';
import { GoogleAuth } from 'google-auth-library';
import { AIPlatformClient } from '@google-cloud/aiplatform';
import AWS from 'aws-sdk';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    })
  });
}
const db = admin.firestore();

// GCP Vertex AI constants
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID;
const GCP_LOCATION = process.env.GCP_LOCATION;
const GCP_MODEL_ID = 'gemini-2.0-flash-lite';

// AWS STS for GCP authentication
const sts = new AWS.STS();

async function callVertexAI(prompt) {
    const clientOptions = {
        apiEndpoint: `${GCP_LOCATION}-aiplatform.googleapis.com`,
    };

    // Use GoogleAuth to automatically authenticate using Workload Identity Federation
    const auth = new GoogleAuth({
        scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });
    const authClient = await auth.getClient();

    const client = new AIPlatformClient({ ...clientOptions, auth: authClient });

    const endpoint = `projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/publishers/google/models/${GCP_MODEL_ID}`;

    const request = {
        endpoint,
        instances: [{
            content: prompt,
        }, ],
        parameters: {
            temperature: 0.2,
            maxOutputTokens: 500,
            topP: 0.95,
            topK: 40,
        },
    };

    console.log('Calling Vertex AI with request:', JSON.stringify(request, null, 2));

    try {
        const [response] = await client.predict(request);
        console.log('Got response from Vertex AI');
        // Make sure to access the content correctly based on the model's response structure
        return response.predictions[0].structValue.fields.content.stringValue;
    } catch (error) {
        console.error('Error calling Vertex AI:', error);
        throw error;
    }
}


export const handler = async (event) => {
  console.log('Summarizer function triggered with event:', JSON.stringify(event, null, 2));

  const { userId, conversationTurn } = event;
  const { userMessage, aiResponse } = conversationTurn;

  if (!userId || !userMessage || !aiResponse) {
    console.error('Missing required fields in the event payload');
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Missing userId, userMessage, or aiResponse' }),
    };
  }

  try {
    console.log(`Processing summary for user: ${userId}`);
    const startTime = Date.now();

    // 1. Retrieve previous summary from Firebase
    const memoryRef = db.collection('memory').doc(userId);
    const doc = await memoryRef.get();
    const previousSummary = doc.exists ? doc.data().summary : '';
    console.log(`Previous summary retrieved. Length: ${previousSummary.length}`);

    // 2. Construct the prompt for Gemini
    const prompt = `Previous summary: ${previousSummary}\n\nNew conversation turn:\nUser: ${userMessage}\nAssistant: ${aiResponse}\n\nTask: Create a concise updated summary that:\n- Preserves important context from previous summary\n- Incorporates key information from new conversation turn\n- Maintains continuity for future conversations\n- Keeps it under 500 tokens`;
    console.log(`Prompt constructed. Length: ${prompt.length}`);

    // 3. Call Gemini 2.0 Flash Lite API
    const updatedSummary = await callVertexAI(prompt);
    console.log(`Updated summary received. Length: ${updatedSummary.length}`);

    // 4. Save updated summary to Firebase
    await memoryRef.set({
      summary: updatedSummary,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      messageCount: admin.firestore.FieldValue.increment(1)
    }, { merge: true });
    console.log(`✅ Memory saved for user: ${userId}`);

    const endTime = Date.now();
    console.log(`Summary processing took ${endTime - startTime} ms.`);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Summary updated successfully' }),
    };

  } catch (error) {
    console.error('❌ Error processing summary:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal Server Error' }),
    };
  }
};
