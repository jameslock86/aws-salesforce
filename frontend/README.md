# AWS Admin Frontend (Next.js)

This is a small admin dashboard UI for your AWS demo backend (API Gateway → Lambda → RDS + S3).

## Setup

1) Install deps
```bash
npm install
```

2) Create `.env.local`
```bash
cp .env.example .env.local
# edit .env.local to match your API + token
```

3) Run locally
```bash
npm run dev
```

Open: http://localhost:3000

## Vercel
Set these env vars in Vercel:
- NEXT_PUBLIC_API_BASE_URL
- NEXT_PUBLIC_ADMIN_TOKEN

Then deploy.
