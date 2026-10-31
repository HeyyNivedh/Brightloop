# Brightloop Subscription Management System

[![Next.js](https://img.shields.io/badge/Next.js-16.4-black.svg?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.19-2D3748.svg?logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18.6-336791.svg?logo=postgresql)](https://www.postgresql.org/)
[![Tests](https://img.shields.io/badge/Tests-111%20Passing-emerald.svg)](./src/tests/)
[![Build](https://img.shields.io/badge/Build-Passing-emerald.svg)](https://nextjs.org/)

A full-stack, enterprise-grade, multi-tenant **Software Subscription & Billing Engine** built with Next.js 16, TypeScript, PostgreSQL (v18.6), and Prisma 6.

---

## 🌟 Key Features & Deliverables

### 1. Complete Full-Stack Web Experience
- **Customer Self-Service Portal (`/portal`)**: Active subscription status, billing renewal dates, invoice history, and immediate invoice payment settlement.
- **Executive Analytics Dashboard (`/dashboard`)**: Real-time Monthly Recurring Revenue (MRR), Active Subscribers, Annual Run Rate (ARR), and recent operational events.
- **Financial & Revenue Reports (`/dashboard/reports`)**: Interactive revenue charts, historical analytics across customizable time windows (7d, 30d, 90d, All), and customer growth metrics.
- **Administrative Console (`/admin`)**: Unified management for Products, Variants, Subscription Plans, Tax Rules, Discount Coupon Codes, and Customer Accounts.
- **Authentication & Security (`/login`, `/register`)**: Form validation, instant demo login helper buttons, session cookies, and single-use password recovery.

### 2. Normalized Relational Database (PostgreSQL & Prisma 6)
- **20 Business Models & 10 Enums**: Normalized schema modeling Users, Customers, Products, Variants, Plans, Quotations, Subscriptions, Invoices, Payments, Taxes, Discounts, and Audit Logs.
- **Exact Monetary Precision**: All financial amounts use PostgreSQL `@db.Decimal(12, 2)` and tax rates use `@db.Decimal(5, 4)` to eliminate floating-point IEEE-754 drift.
- **Zero-Config Embedded PostgreSQL Runner**: Includes a built-in embedded database runner (`npm run db:start`) so anyone cloning the repo has a real, persistent PostgreSQL instance running locally in seconds without Docker or native admin installers.

### 3. Subscription Lifecycle & Billing Engine
- **Subscription State Machine**: Manages transitions between `TRIALING`, `ACTIVE`, `PAST_DUE`, `PAUSED`, `CANCELLED`, and `EXPIRED`.
- **Quotations & One-Click Conversion**: Create customized proposals with line items and convert accepted quotes into active subscriptions.
- **Automated Invoicing & Idempotency**: Recurring invoice generation with billing period date arithmetic and idempotency safeguards against double-billing.
- **Payment Reconciliation**: Partial payments, full settlements, provider charge tracking (Stripe/Card/Bank), and refund balance reconciliation.

### 4. Dynamic Pricing, Tax & Discount Calculator
- **Variant Pricing**: Base price configuration plus variant attribute price additions (tier, compute units, storage seats).
- **Flexible Billing Intervals**: Support for `DAY`, `WEEK`, `MONTH`, and `YEAR` subscription cadences.
- **Jurisdiction-Aware Taxes**: State, province, and international VAT rates with compound calculation support.
- **Promotional Coupon Engine**: Percentage or fixed-amount discounts with order minimums, max discount caps, and atomic usage tracking.

### 5. Multi-Tenant Security & Customer Isolation (IDOR Defense)
- **Three-Tier Role-Based Access Control (RBAC)**: `ADMIN` (superuser), `STAFF` (operational), and `CUSTOMER` (self-service).
- **IDOR Protection (`requireCustomerScope`)**: Customer accounts are strictly bounded to their own record; cross-tenant data access is blocked server-side with `403 Forbidden`.
- **Next.js 16 Edge Proxy (`src/proxy.ts`)**: Centralized route protection for administrative and internal routes.

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js v20+ or v24+
- npm v10+

### Setup Instructions

```bash
# 1. Clone and navigate into the repository
cd Brightloop

# 2. Install dependencies
npm install

# 3. Configure environment variables (defaults work out of the box)
cp .env.example .env

# 4. Start the persistent embedded PostgreSQL daemon
npm run db:start

# 5. Push schema and seed development demo data
npm run db:push
npm run db:seed

# 6. Run automated test suite (111 tests)
npm test

# 7. Start the Next.js development server
npm run dev
```

Visit **[http://localhost:3000](http://localhost:3000)** to open the application.

---

## 🧭 Application Routes Map

| URL | View | Access Level | Description |
|---|---|---|---|
| `http://localhost:3000/` | **Home / Dev Portal** | Public | System status, live database telemetry, seed counters, and demo credentials. |
| `http://localhost:3000/login` | **Sign In** | Public | Authentication with 1-click demo login buttons. |
| `http://localhost:3000/register` | **Sign Up** | Public | Self-service customer registration. |
| `http://localhost:3000/portal` | **Customer Portal** | Customer | Self-service billing, active subscriptions, invoice list, and payments. |
| `http://localhost:3000/dashboard` | **Executive Dashboard** | Admin / Staff | Real-time MRR, subscriber stats, customer directory, quick actions. |
| `http://localhost:3000/dashboard/reports` | **Financial Reports** | Admin / Staff | Revenue trends, churn metrics, and customer growth analytics. |
| `http://localhost:3000/dashboard/customers` | **Customer Management** | Admin / Staff | Search, view, and manage customer accounts. |
| `http://localhost:3000/dashboard/audit-logs` | **Audit Logs** | Admin Only | Security audit trail for compliance and event inspection. |
| `http://localhost:3000/admin` | **Admin Console** | Admin Only | Full catalog manager: Products, Variants, Plans, Taxes, Discounts. |
| `http://localhost:5555` | **Prisma Studio** | Developer (`npx prisma studio`) | Interactive web database viewer for all 20 relational models. |

---

## 🔑 Pre-Seeded Demo Credentials

| Role | Email | Password | Access & Responsibilities |
|---|---|---|---|
| **ADMIN** | `admin@brightloop.com` | `Admin123!@#` | Superuser: full catalog, tax/discount rules, reports, staff management, audit trail. |
| **STAFF** | `staff@brightloop.com` | `Staff123!@#` | Operations: customer management, subscriptions, invoices, payments, reports. |
| **CUSTOMER** | `customer@acme.com` | `Customer123!@#` | Self-Service Portal: strictly isolated to Acme Enterprises Inc. (`CUST-00001`). |

*(Tip: On the `/login` page, you can click the quick-login pills to fill credentials automatically!)*

---

## 🧪 Automated Test Suite (111 Tests)

Run the automated test suite across all 4 integrated modules:

```bash
npm test
```

### Test Coverage Breakdown:
- **`src/tests/auth.test.ts`**: Password hashing, JWT signing/verification, expired token detection, untrusted secret rejection, single-use reset tokens, and Edge proxy route protection.
- **`src/tests/rbac.test.ts`**: 3-tier hierarchy (`ADMIN` > `STAFF` > `CUSTOMER`), permission matrices, server-side `401` and `403` route guard enforcement.
- **`src/tests/customer-isolation.test.ts`**: IDOR attack prevention, customer cross-account access blocking, database query isolation.
- **`src/tests/validation.test.ts`**: Password complexity validation, email normalization, pagination clamping (DoS protection), and shared Zod schemas.
- **`src/tests/api-routes.test.ts`**: End-to-end API integration flow (registration, duplicate conflict handling, login, session `/me`, staff creation guard).
- **`src/tests/subscriptions-billing.test.ts`**: Subscription lifecycle transitions (`ACTIVE` &rarr; `PAUSED`), quotation acceptance to subscription conversion, invoice generation, duplicate billing prevention, partial and full payments, refunds.
- **`src/tests/product-management.test.ts`**: Product catalog CRUD, variant price additions, multi-interval subscription plan configuration.
- **`src/tests/pricing-and-taxes.test.ts`**: Jurisdiction tax rate calculations, compound taxes, promo code evaluation (caps, spend minimums, atomic usage counts).
- **`src/tests/dashboard-portal.test.ts`**: Financial report analytics aggregations, customer portal summary API, IDOR query isolation, UI currency/date formatting helpers.

---

## 📁 Repository Structure

```
Brightloop/
├── docs/                                 # Technical architecture & integration guides
│   ├── api-contracts.md                  # REST envelopes, error codes, and endpoint specifications
│   ├── database-architecture.md          # ERD diagram, 20 models, indexing, and precision rules
│   └── integration-guide.md              # Team development conventions and boundaries
├── prisma/                               # Prisma 6 database layer
│   ├── migrations/                       # Baseline PostgreSQL migrations
│   ├── schema.prisma                     # Complete relational schema (20 models, 10 enums)
│   └── seed.ts                           # Comprehensive development database seeder
├── prisma.config.ts                      # Prisma configuration file
├── scripts/
│   └── db-service.js                     # Local embedded PostgreSQL runner
├── src/
│   ├── app/                              # Next.js 16 App Router
│   │   ├── (auth)/                       # /login, /register
│   │   ├── admin/                        # /admin (Catalog & Rules Management)
│   │   ├── dashboard/                    # /dashboard, /dashboard/reports, customers, audit-logs
│   │   ├── portal/                       # /portal (Customer Self-Service Portal)
│   │   ├── api/                          # 30+ REST API route handlers
│   │   │   ├── auth/                     # login, register, logout, me, forgot/reset-password
│   │   │   ├── customers/                # customer CRUD & isolation
│   │   │   ├── products/                 # products & variants
│   │   │   ├── plans/                    # plans & pricing
│   │   │   ├── subscriptions/            # subscriptions, renewal, status transitions
│   │   │   ├── quotations/               # quotes & confirmation
│   │   │   ├── invoices/                 # invoice generation, status, settlement
│   │   │   ├── payments/                 # payment processing & refunds
│   │   │   ├── reference/                # tax-rules, discount-rules, roles
│   │   │   ├── reports/                  # MRR, ARR, revenue metrics
│   │   │   └── audit-logs/               # compliance audit logs
│   │   ├── layout.tsx
│   │   └── page.tsx                      # Developer & System Status portal
│   ├── components/                       # Shared UI components (Navbar, Badge, StatCard, etc.)
│   ├── lib/                              # Shared backend infrastructure (@/lib)
│   │   ├── api/                          # response envelopes, errors, pagination, transaction, audit
│   │   ├── auth/                         # session, password, tokens, email-adapter
│   │   ├── billing/                      # invoices, payments, subscriptions, quotations
│   │   ├── pricing/                      # taxes, discounts, variant pricing calculators
│   │   ├── rbac/                         # permissions & role guards
│   │   ├── validation/                   # Zod schemas for all modules
│   │   ├── db.ts                         # Singleton Prisma Client
│   │   └── env.ts                        # Validated environment variables
│   ├── proxy.ts                          # Next.js 16 Edge proxy route guard
│   ├── tests/                            # 111 automated unit & integration tests
│   └── types/                            # Shared TypeScript interfaces
├── eslint.config.mjs
├── next.config.ts
├── package.json
└── tsconfig.json
```

---

## 👥 Team Module Ownership

- **Member 1 (Shared Backend Foundation & Lead Integration)**: Application architecture, authentication & session management, RBAC, environment validation, database schema & migrations, shared API envelopes, Zod schemas, security hardening, and integration testing.
- **Member 2 (Subscription Lifecycle & Billing)**: Subscription state machine, quotation lifecycle, automated invoice generation, payment processing, partial settlements, and refund reconciliation.
- **Member 3 (Product & Pricing Management)**: Product & variant catalog, multi-cadence subscription plans, variant pricing rules, compound tax calculators, and promotional coupon engine.
- **Member 4 (Dashboard & Customer Portal)**: Executive analytics dashboard, revenue reporting charts, customer self-service portal, authentication pages, and UI components.
