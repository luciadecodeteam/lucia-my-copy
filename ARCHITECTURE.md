L.U.C.I.A Project Handover Documentation

This document serves as a comprehensive guide for the final handover of the L.U.C.I.A project. It is designed to provide a clear, non-technical overview of the system's architecture, operational requirements, and maintenance procedures.


1: Live Services and Access

The L.U.C.I.A platform relies on several industry-standard external services to provide its features. These services are actively running in production and are essential for the application's functionality.

You can access all these apps, open any browser (ex. Chrome). Log in luciadecodeteam@gmail.com as the active gmail account. 

Then you can access these websites from there. 

GitHub hosts the source code and manages version control. It also triggers automatic updates to the live site when changes are approved. github.com 

Vercel is the primary hosting provider. It hosts the Frontend (the website you see) and the Backend Proxy (the middleman that talks to other services). vercel.com 

Firebase (Google Cloud) covers three areas. Authentication manages user logins, sign-ups, and secure identity. Firestore (Database) stores all user data, message history, subscription tiers, and usage limits. Functions handles background tasks, such as processing data when a user signs up. firebase.com 

AWS (Amazon Web Services) covers two areas. Lambda runs the core AI processing logic for Chat and Summarization, and is the heavy lifter for AI interactions. Secrets Manager is a secure vault that stores sensitive API keys and configuration prompts. You can use your admin account for this.

Stripe processes all payments and subscriptions. You already have access to this.

Cloudflare provides an additional layer of security and edge computing through Workers, which can act as a backup or specialized proxy for AI requests. cloudflare.com 

Google Vertex AI / Gemini is the underlying AI brain that generates responses for the chat.

Namecheap / Domain Provider manages the luciadecode.com (or equivalent) web address.

Mailjet / Email Service (managed externally via dashboard) handles transactional emails like password resets or verification links.

Note: All services listed above are managed externally via their respective dashboards. Access credentials for these platforms should be kept secure.




2: Backend Architecture

L.U.C.I.A uses a serverless architecture, meaning it does not rely on a single traditional server but rather a network of specialized functions that run only when needed.

The End-to-End Request Path:

A user types a message in the L.U.C.I.A chat interface. 

The website sends this message to the Backend. 

The Backend (Vercel/Node.js) validates the user's session and forwards the request to the AI logic. 

The Lambda function wakes up, retrieves the necessary API keys from the AWS Secrets Manager, and prepares the context for the AI. The request is sent to Google's Gemini AI, which generates a response. 

The response is sent back to the Lambda function, which formats it. 

The formatted reply travels back through the Backend to the user's screen via Vercel. 

The system automatically updates the user's message count and saves the conversation history in the background via Firestore.




3: Configuration and Operational Knowledge

Environment Variables

The application's behavior is controlled by environment variables found in the Vercel and AWS dashboards. These include:

VITE_FIREBASE_CONFIG connects the frontend to the database. 

VITE_STRIPE_PUBLISHABLE_KEY allows the website to initiate payments. 

STRIPE_SECRET_KEY is used by the backend to securely communicate with Stripe. 

CHAT_LAMBDA_URL is the specific address of the AI processing function. 

GOOGLE_API_KEY are the keys that authorize AI usage.

Database and Subscription Logic

Data is stored in collections within Firebase Firestore. The most important is the users collection, where each document contains a user's tier (e.g., free, weekly) and messageAllowance.

Authentication is managed by Firebase. When a user logs in, the system finds their corresponding document in Firestore to check their permissions.

During payments:

When a payment is successful, Stripe sends a webhook signal to the system, which automatically updates the user's tier in the Firebase database.

Safe Manual Operations

You can manually change a user's access level by finding their record in the Firebase Firestore console and updating the tier field. 

Refunds must be handled directly through the Stripe Dashboard. The system will automatically detect the cancellation if configured, or you can manually downgrade the user in Firebase.






4: Deployment and Troubleshooting

Deployment and Rollbacks

The project is set up for continuous deployment. Any changes pushed to the main branch on GitHub are automatically built and deployed to the live site on Vercel.

If a new update causes an issue, go to the Vercel Dashboard, select Deployments, find a previous working version, and click Redeploy or Promote to Production to instantly revert.

Troubleshooting

For checking logs: Vercel Logs should be checked for errors related to the website or the backend proxy. AWS CloudWatch should be checked for errors related to AI response failures such as 502 errors. The Firebase Console Functions tab should be checked for errors in background tasks.


