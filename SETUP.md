# ThreadsMarket — Full Stack E-Commerce Marketplace

A production-ready clothing e-commerce marketplace built with Next.js 16, Supabase, Stripe, and crypto payments (RainbowKit/Wagmi).

---

## Features

- **Authentication** — Email/password login & registration with Supabase Auth
- **Product Catalog** — Categories, variants (size/color), filters, search
- **Shopping Cart & Wishlist** — Persistent with Zustand
- **Checkout** — Stripe card payments + USDT/USDC crypto payments (Ethereum, Polygon, BSC, Base)
- **Order Management** — Order history, tracking, invoices
- **Admin Panel** — Products, orders, categories, users, reviews, promotions, analytics
- **Email Notifications** — Order confirmation, status updates via Nodemailer
- **SEO Ready** — Sitemap, robots.txt, metadata

---

## Tech Stack

| Layer      | Technology                         |
| ---------- | ---------------------------------- |
| Framework  | Next.js 16 (App Router)            |
| Language   | TypeScript                         |
| Styling    | Tailwind CSS v3                    |
| Database   | Supabase (PostgreSQL)              |
| Auth       | Supabase Auth                      |
| Storage    | Supabase Storage                   |
| Payments   | Stripe + RainbowKit/Wagmi (crypto) |
| State      | Zustand                            |
| Forms      | React Hook Form + Zod              |
| Email      | Nodemailer (Gmail SMTP)            |
| Deployment | Docker + Nginx (Hostinger VPS)     |

---

## Prerequisites

- A [Supabase](https://supabase.com) account (free)
- A [Stripe](https://stripe.com) account (free)
- A [WalletConnect](https://cloud.walletconnect.com) project (free)
- A Gmail account (for email notifications)
- A Hostinger VPS (Ubuntu 22.04 recommended)
- A GitHub account

---

## Step 1 — Set Up Supabase

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Go to **SQL Editor** → paste and run the full contents of `supabase/migrations/001_initial_schema.sql`
3. Go to **Project Settings → API** and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 2 — Set Up Stripe

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) → **Developers → API Keys**
2. Copy:
   - Publishable key → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - Secret key → `STRIPE_SECRET_KEY`
3. Go to **Developers → Webhooks → Add endpoint**:
   - URL: `http://YOUR_VPS_IP/api/webhooks/stripe` (update to domain later)
   - Events: `payment_intent.succeeded`, `payment_intent.payment_failed`
   - Copy **Signing secret** → `STRIPE_WEBHOOK_SECRET`

---

## Step 3 — Set Up WalletConnect

1. Go to [cloud.walletconnect.com](https://cloud.walletconnect.com) → **New Project**
2. Copy **Project ID** → `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`

---

## Step 4 — Set Up Gmail App Password

1. Enable **2-Step Verification** on your Google account
2. Go to Google Account → Security → **App passwords**
3. Generate a password for "Mail"
4. Use the 16-character code as `SMTP_PASS`

---

## Step 5 — Push Code to GitHub

1. Create a new repository on [github.com](https://github.com)
2. Push the code:

```bash
git remote set-url origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git add .
git commit -m "initial commit"
git push -u origin main
```

---

## Step 6 — Deploy to Hostinger VPS

### 6.1 — SSH into your VPS

In Hostinger dashboard → VPS → **SSH Access**:

```bash
ssh root@YOUR_VPS_IP
```

If you get a "host key changed" warning:

```bash
ssh-keygen -R YOUR_VPS_IP
ssh root@YOUR_VPS_IP
```

### 6.2 — Install Docker & Git

```bash
apt update && apt upgrade -y
apt install -y docker.io docker-compose git
systemctl enable docker && systemctl start docker
```

### 6.3 — Clone your repository

GitHub no longer accepts passwords — use a Personal Access Token:

1. GitHub → Settings → Developer Settings → **Personal Access Tokens → Tokens (classic)**
2. Generate token with **repo** scope → copy it

```bash
cd /opt
git clone https://YOUR_GITHUB_USERNAME:YOUR_TOKEN@github.com/YOUR_USERNAME/YOUR_REPO.git ecommerce
cd ecommerce
```

### 6.4 — Create environment file

```bash
nano .env.production
```

Paste and fill in all your values:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# App — use your VPS IP for now, update to domain later
NEXT_PUBLIC_APP_URL=http://YOUR_VPS_IP
NEXT_PUBLIC_APP_NAME=Lfour37

# Email (Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password
EMAIL_FROM=noreply@yourdomain.com

# WalletConnect
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id

# Crypto Contract Addresses (do not change)
NEXT_PUBLIC_USDT_ETHEREUM=0xdAC17F958D2ee523a2206206994597C13D831ec7
NEXT_PUBLIC_USDC_ETHEREUM=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
NEXT_PUBLIC_USDT_POLYGON=0xc2132D05D31c914a87C6611C10748AEb04B58e8F
NEXT_PUBLIC_USDC_POLYGON=0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
NEXT_PUBLIC_USDT_BSC=0x55d398326f99059fF775485246999027B3197955
NEXT_PUBLIC_USDC_BSC=0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d
NEXT_PUBLIC_USDT_BASE=0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2
NEXT_PUBLIC_USDC_BASE=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

# Your crypto wallet address to receive payments
NEXT_PUBLIC_MERCHANT_WALLET=your_wallet_address

# Rate limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000
```

Save: `Ctrl+X → Y → Enter`

### 6.5 — Build and start

```bash
cp .env.production .env
docker-compose up -d --build
```

Wait 3–5 minutes for the first build. Then open `http://YOUR_VPS_IP` in your browser — site is live.

### 6.6 — Check status

```bash
docker-compose ps
docker-compose logs -f app
```

---

## Step 7 — Create Admin User

1. Register a new account on the site
2. Go to Supabase → **Table Editor → users**
3. Find your user → change `role` from `customer` to `super_admin`
4. Access the admin panel at `http://YOUR_VPS_IP/admin`

---

## Step 8 — Add a Domain with SSL (Optional)

Once you have a domain pointed to your VPS IP:

```bash
# Install Certbot
apt install -y certbot

# Stop nginx temporarily for certbot
docker-compose stop nginx

# Get SSL certificate
certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Update nginx.conf with your domain (already included in the repo)
nano nginx.conf
# Replace all "yourdomain.com" with your actual domain

# Update app URL
nano .env.production
# Change: NEXT_PUBLIC_APP_URL=https://yourdomain.com
cp .env.production .env

# Rebuild
docker-compose down
docker-compose up -d --build
```

Also update your Stripe webhook URL to `https://yourdomain.com/api/webhooks/stripe`.

---

## Redeploy After Updates

```bash
cd /opt/ecommerce
git pull
cp .env.production .env
docker-compose down
docker-compose up -d --build
```

---

## Test Stripe Payments

Use these test card details on the checkout page:

| Field       | Value                          |
| ----------- | ------------------------------ |
| Card number | `4242 4242 4242 4242`          |
| Expiry      | Any future date (e.g. `12/34`) |
| CVC         | Any 3 digits (e.g. `123`)      |
| ZIP         | Any 5 digits (e.g. `12345`)    |

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/         # Login, register, forgot password
│   ├── (store)/        # Homepage, products, cart, checkout, dashboard
│   ├── admin/          # Admin panel
│   └── api/            # API routes
├── components/
│   ├── admin/          # Admin components
│   ├── checkout/       # Stripe + crypto payment forms
│   ├── home/           # Homepage sections
│   ├── product/        # Product cards, filters, reviews
│   └── ui/             # Shared UI components
├── lib/
│   ├── supabase/       # Supabase client (browser + server)
│   ├── stripe.ts       # Stripe helpers
│   ├── crypto/         # Wagmi config, contract addresses
│   ├── email.ts        # Nodemailer email sending
│   └── validations/    # Zod schemas
├── store/              # Zustand stores (cart, wishlist, ui)
└── types/              # TypeScript types
supabase/
└── migrations/
    └── 001_initial_schema.sql  # Full database schema
```

---

Deploy to Hostinger VPS (72.62.228.207)
Step 1 — Push Code to GitHub (on your Mac)

# In your project folder

cd "/Users/daulathussain/Desktop/Ecommerce App"

git init
git add .
git commit -m "initial commit"

# Create a repo on github.com first, then:

git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
Step 2 — Fix SSH Host Key Warning (if needed, on your Mac)
If you get a "host key changed" error:

ssh-keygen -R 72.62.228.207
Then connect:

ssh root@72.62.228.207

Step 3 — Install Docker & Git (on the VPS)

apt update && apt upgrade -y
apt install -y docker.io docker-compose git
systemctl enable docker && systemctl start docker

Step 4 — Create GitHub Personal Access Token

Go to GitHub → Settings → Developer Settings → Personal Access Tokens → Tokens (classic)
Click Generate new token (classic)
Give it repo scope → click Generate
Copy the token (you won't see it again)
Step 5 — Clone Your Repo on the VPS

cd /opt
git clone https://Y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@github.com/daulathussain/E-Commerce-App-Live-Hostinger.git ecommerce
cd ecommerce

Step 6 — Create the Environment File

nano .env.production
Paste this and fill in your values:

# Supabase

NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Stripe

NEXT*PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test*...
STRIPE*SECRET_KEY=sk_test*...
STRIPE*WEBHOOK_SECRET=whsec*...

# App URL — use your VPS IP

NEXT_PUBLIC_APP_URL=http://72.62.228.207
NEXT_PUBLIC_APP_NAME=Lfour37

# Gmail SMTP

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_16_char_app_password
EMAIL_FROM=noreply@gmail.com

# WalletConnect

NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id

# Crypto Contracts (keep these as-is)

NEXT_PUBLIC_USDT_ETHEREUM=0xdAC17F958D2ee523a2206206994597C13D831ec7
NEXT_PUBLIC_USDC_ETHEREUM=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
NEXT_PUBLIC_USDT_POLYGON=0xc2132D05D31c914a87C6611C10748AEb04B58e8F
NEXT_PUBLIC_USDC_POLYGON=0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
NEXT_PUBLIC_USDT_BSC=0x55d398326f99059fF775485246999027B3197955
NEXT_PUBLIC_USDC_BSC=0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d
NEXT_PUBLIC_USDT_BASE=0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2
NEXT_PUBLIC_USDC_BASE=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

# Your wallet to receive crypto payments

NEXT_PUBLIC_MERCHANT_WALLET=0xYourWalletAddress

# Rate limiting

RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000
Save: Ctrl+X → Y → Enter

Step 7 — Build and Start

cp .env.production .env
docker-compose up -d --build
This takes 3–5 minutes for the first build. Watch progress:

docker-compose logs -f app
Step 8 — Verify It's Running

docker-compose ps
Both app and nginx should show Up. Then open:

http://72.62.228.207
Step 9 — Create Admin Account
Register a new account on the site at http://72.62.228.207/register
Go to Supabase → Table Editor → users
Find your user → change role to super_admin
Access admin at http://72.62.228.207/admin
Step 10 — Update Stripe Webhook
In your Stripe dashboard → Developers → Webhooks → Add endpoint:

URL: http://72.62.228.207/api/webhooks/stripe
Events: payment_intent.succeeded, payment_intent.payment_failed
Redeploy After Updates

cd /opt/ecommerce
git pull
cp .env.production .env
docker-compose down
docker-compose up -d --build
Common issues:

Port 80/443 blocked? Run: ufw allow 80 && ufw allow 443
Build fails? Check logs: docker-compose logs app
Old containers stuck? Run: docker system prune -f then rebuild
