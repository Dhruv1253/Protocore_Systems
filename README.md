# Protocore Finance App (Realtime + Roles + UPI + Reports)

Vite + React + Tailwind + Firebase (Auth + Firestore)
- Email/password login + password reset
- Founders: Dhruv, Vishal, Shubham
- Role-based access: admin can edit founders & manage invites
- UPI payment links + QR for settlements
- Monthly reports + CSV export

## Firestore
- orgs/protocore/meta/settings: { founders: [...], adminEmails: ['you@domain.com'] }
- orgs/protocore/transactions: expense docs
- orgs/protocore/meta/invites: { email, createdAt, createdBy }

## Setup
1) Create Firebase project, enable Auth (Email/Password) + Firestore
2) Copy `.env.example` -> `.env` with your config
3) Add your email into `adminEmails` array via Firestore (or app's Admin tab)
4) Create users in Firebase Console, or use the 'Invites' list as a checklist

## Run
npm install
npm run dev

## Deploy
Set environment variables on Vercel, build with `npm run build`, output `dist`.
