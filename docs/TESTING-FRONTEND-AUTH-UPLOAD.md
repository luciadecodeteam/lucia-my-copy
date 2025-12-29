# Frontend Auth + Upload Test

1) Configure frontend/.env
   VITE_API_BASE_URL=lucia-secure.arkkgraphics.workers.dev
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id

2) Firebase Console:
   - Enable Authentication → Sign-in methods: Google and/or Email/Password
   - Add http://localhost:5173 to Authorized domains

3) Backend .env (dev):
   PORT=8080
   CORS_ORIGIN=http://localhost:5173
   FIREBASE_PROJECT_ID=ae33e0fb824aaf8167a1a2869c3d77833173c427
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@lucia--dev.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDlkjcmf8NMRq+D\nAc8AK2hOxNQYFByGEiQTP9EIXV9UxkB2ZN89uqiQVuxaM7tcyNr0SG8t5W5EFyin\ne/XAXf1LSjS83hglz0adjWviAnNd8eqUsunVC777+d0Ou6M/p5cF3Z6fzNzk2naL\nQes7ZHZHSGPSExVKCr4XkVdN+Y/xDQ8CXeJ2ns6PjhFiSO8H/ScRL/B+HvdLWeB+\nNVtwGJ81EFir9BPq5ug4uWEsttJ8BPtf6KdgM2FqchMHIbKKUUkuWNiwR8wGFtJJ\niWPkipxX0BGJK0ra7fgRwK75Y5cb8FxWlIfbFSzZWZue8WvdmHLhFDa1vj/AwHmB\n5qs5N2nHAgMBAAECggEAVng9d63V9OwG/dR3kLvI3Sp8LNmeaM16cxmtdXYeC0Nl\nUnLqN0kQZtWmzs7/epJZDnweDG6HmvQSJwuk5CFC39ICjUUmWU96bKuw//8mTzNo\nxTuiodF7zVMu9XatpbNNSjNQpSY36adz0T4yCTvs5SqaFq2DblEfiqb++GrQ0dz/\nhf3hlqKP8oAXhxPTH5uBFpHozjw0RxTvmHx9Etqj2NIx4G4cJKzW5XGgrv/N4bhB\nQeUM47LnidyjvKCiuqWJ1RAOdHGnD5tQtzi/a1wYswpIh0L7rIGgyX+UyiciMnor\n95b8ZCu0ERurFYRINe5m0yA1FdPA0GVBK0pNvc48cQKBgQD9T/LDFhwrRttRVle9\nJEh2E0s4AMHxOLJLp2LOuJ8RCV5RdVB+oOSsVLNBKWvzNQmYhKnmODlRcCDjFHEz\nXk6mzHReWiQ3x0zlpkTVKZsfjhA3KPZVQPt9k4gFvVXkMZhhLmPbABlsbIvUiouW\n/Wx0exW4p1uguC4W9nR0B6gu7wKBgQDoAcfvHe3VWllFkTjtPdSwI/7Mi4o8CfOP\nboDFaNuVAAt6dMpiXw+1u5f3amHa1UwZ8E4FuslBbXX56f61av+8ZWtvuNs1Eijt\nPnsXGnmicUxUB0s3K4cLsQX/UwPVLyONf//Eb8qKVWO8TXliEfSAuJ3tzMA9sV04\nEjfunlZyqQKBgHj94d9qxSOqoYD1M81E8lNrncbvHbOhOBBIsDo7FsclaWaRGVSS\ndwcVIdWi+kvdbmrqGti6zC3o19x+3B8EEZ88Eu0qMxhtWn5qb4A9cjmdOoOOTjKk\najst54+OQuNPCRCJ/uoQ3xPZuORZFJmXDGGKlPJxBaP7tRAEwdTV/3ADAoGBALP7\nVbgZVrzRpzmBrFDXS50Nf4f8pFNpQOo/RmResSHI9B6eZbakmlJYYk7M13blS3E/\n67ckLSa1nPUwYqkohZYIc60rEdr86IULmH/WyQ+MpzL0qZP2D4CxZr6pDusd8429\nA5THSK/CCGo3C/hZh30oO1QUJ/p0EqYB9CQH73ZpAoGBAJHk1ar9tuyFzYhY98IH\n04Rg5204hC+ZMgdxR15TCB9toYtkU9KX7CKZEvRhona6HjPF5mRoA3PFDitZXyO8\nwIr1lg2hZg/gdfde81O4YEqEw2vWFxwYn6ucXqJBS5+yd6CANz2x6lPavM8rHy4A\n9wdFUvkcXJaQ7E/zMzgiB3Te\n-----END PRIVATE KEY-----\n"
   S3_BUCKET=...
   S3_REGION=...
   AWS_ACCESS_KEY_ID=...        # dev only
   AWS_SECRET_ACCESS_KEY=...    # dev only
   KMS_KEY_ID=...

4) S3 CORS (see infra/aws/s3-cors.json). Apply in S3 console.

5) Run:
   # terminal A
   cd backend && npm i && npm run dev
   # terminal B
   cd ../frontend && npm i && npm run dev
   Open http://localhost:5173

6) Flow:
   - Sign in
   - Choose a small file
   - Click "Presign & Upload"
   - Expect: "✅ Uploaded: s3://<key>"
