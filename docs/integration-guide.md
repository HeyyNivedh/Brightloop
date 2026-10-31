# Integration Guide: Brightloop Development Team

Hello team! This guide explains how to build your modules on top of the shared backend foundation. Follow these conventions to ensure smooth integration, consistent error handling, and zero database schema conflicts.

---

## 1. Quickstart & Local Environment

### Database Setup
The repository includes an embedded PostgreSQL runner so you don't need Docker or a local PostgreSQL installation.

```bash
# 1. Start the embedded PostgreSQL daemon
npm run db:start

# 2. Check if the database is ready
npm run db:check

# 3. Apply migrations and seed data
npm run db:push
npm run db:seed

# 4. Run automated tests to verify your environment
npm test

# 5. Start the development server
npm run dev
```

### Demo Accounts for Testing
- **Admin**: `admin@brightloop.com` / `Admin123!@#`
- **Staff**: `staff@brightloop.com` / `Staff123!@#`
- **Customer**: `customer@acme.com` / `Customer123!@#`

---

## 2. Shared Utilities Import Reference

Import everything you need directly from `@/lib`:

```typescript
import {
  prisma,                  // Singleton Prisma Client
  apiSuccess,              // Standard success response helper
  apiError,                // Standard error response helper
  handleApiError,          // Catch block error formatter
  requireAuth,             // Route guard: any authenticated user
  requireRole,             // Route guard: specific roles [ADMIN, STAFF]
  requireCustomerScope,    // Route guard: customer data isolation (prevents IDOR)
  withTransaction,         // Atomic database transactions
  createAuditLog,          // Audit logging utility
  getPaginationParams,     // Query params (page, limit, skip, sort, search)
  buildPaginationMeta,     // Metadata builder for paginated responses
  UserRole,                // Enum: ADMIN, STAFF, CUSTOMER
} from '@/lib';
```

---

## 3. Guide for Developer 1: Subscription & Billing Module

Your responsibility: Subscriptions, billing intervals, quotation acceptance, invoices, and payments.

### 3.1 Creating a Subscription with Line Items
Always wrap multi-table billing operations inside `withTransaction`:

```typescript
import { withTransaction, apiSuccess, handleApiError, requireCustomerScope } from '@/lib';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { customerId, planId, quantity = 1 } = await req.json();
    
    // Ensure caller is authorized for this customer
    await requireCustomerScope(req, customerId);

    const subscription = await withTransaction(async (tx) => {
      const plan = await tx.subscriptionPlan.findUniqueOrThrow({
        where: { id: planId },
        include: { pricing: { where: { active: true } } },
      });

      const price = plan.pricing[0]?.amount ?? 0;
      const count = await tx.subscription.count();
      const subscriptionNumber = `SUB-${String(count + 1).padStart(5, '0')}`;

      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      return tx.subscription.create({
        data: {
          subscriptionNumber,
          customerId,
          planId,
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          lines: {
            create: {
              description: `${plan.name} (Recurring)`,
              quantity,
              unitPrice: price,
              amount: Number(price) * quantity,
            },
          },
        },
        include: { lines: true },
      });
    });

    return apiSuccess(subscription, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
```

### 3.2 Handling Financial Precision
- Monetary amounts must **always** be formatted as decimals.
- Prisma models return `Prisma.Decimal` instances for `amount`, `unitPrice`, `subtotal`, `taxAmount`.
- When performing mathematical operations, use `.toNumber()` or string parsing carefully, and avoid storing floating-point approximations.

---

## 4. Guide for Developer 2: Product & Pricing Module

Your responsibility: Products, product variants, subscription plans, pricing intervals, tax rules, and discount coupon codes.

### 4.1 Enforcing Administrative Permissions
Creating and updating taxes and discount rules is restricted to `ADMIN` only. Staff and Customers cannot modify these rules:

```typescript
import { requireRole, apiSuccess, handleApiError } from '@/lib';
import { UserRole } from '@prisma/client';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    // Rejects non-admin users with 403 Forbidden
    const admin = await requireRole(req, [UserRole.ADMIN]);

    // Your product / tax / discount creation logic here...
    return apiSuccess(newProduct, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
```

### 4.2 Querying Shared Reference Data
You can query existing tax rules and discounts directly from the database or via the ready reference endpoints:
- `GET /api/reference/tax-rules?country=US&state=CA`
- `GET /api/reference/discount-rules?code=WELCOME20`
- `GET /api/reference/plans`

---

## 5. Guide for Developer 3: Dashboard & Customer Portal Module

Your responsibility: Analytics dashboards, customer self-service portal, profile management, and invoice history.

### 5.1 Enforcing Customer Data Isolation
When building customer portal pages or APIs:
1. Always call `requireCustomerScope(req, targetCustomerId)`.
2. If the user has role `CUSTOMER`, their `session.customerId` is automatically validated against the requested customer record.
3. If they attempt to view or edit another customer's data, an automatic `ForbiddenError` (403) is raised, preventing Insecure Direct Object References (IDOR).

```typescript
import { requireCustomerScope, apiSuccess, handleApiError, prisma } from '@/lib';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  try {
    const { customerId } = await params;
    
    // Automatically enforces isolation
    await requireCustomerScope(req, customerId);

    const invoices = await prisma.invoice.findMany({
      where: { customerId },
      orderBy: { issueDate: 'desc' },
    });

    return apiSuccess(invoices);
  } catch (error) {
    return handleApiError(error);
  }
}
```

### 5.2 Server-Side Session Extraction in Server Components
In Next.js React Server Components (`app/dashboard/page.tsx`), read the session cookie:

```typescript
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, verifySessionToken } from '@/lib';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  
  if (!token) {
    redirect('/login');
  }

  const session = await verifySessionToken(token);
  if (!session) {
    redirect('/login');
  }

  return <div>Welcome, {session.name} ({session.role})</div>;
}
```

---

## 6. Database Changes & Coordination Rules

To avoid merge conflicts across team members:
1. **Do not create separate schema files.** All models must stay in `prisma/schema.prisma`.
2. If you need to add fields or models, propose them in our team chat before running migrations.
3. Run `npm run db:push` during local development, or `npx prisma migrate dev --name your_feature` when ready to commit a migration.
4. Always verify that all existing tests pass (`npm test`) before pushing code.
