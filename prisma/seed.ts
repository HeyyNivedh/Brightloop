import { PrismaClient, UserRole, UserStatus, CustomerStatus, BillingInterval, SubscriptionStatus, InvoiceStatus, PaymentStatus, PaymentMethod, DiscountType, QuotationStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Clean existing records in reverse dependency order
  await prisma.auditLog.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoiceLine.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.subscriptionLine.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.quotationLine.deleteMany();
  await prisma.quotation.deleteMany();
  await prisma.quotationTemplate.deleteMany();
  await prisma.planPricing.deleteMany();
  await prisma.subscriptionPlan.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.taxRule.deleteMany();
  await prisma.discountRule.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();

  console.log('✓ Cleaned existing database records');

  // 2. Seed Permissions
  const permissionsData = [
    // Users & System
    { code: 'users:manage', name: 'Manage System Users', category: 'USERS', description: 'Create and edit staff/admin accounts' },
    { code: 'users:read', name: 'View Users', category: 'USERS', description: 'View system users list' },
    { code: 'audit:read', name: 'View Audit Logs', category: 'AUDIT', description: 'Inspect system-wide audit trail' },
    // Customers
    { code: 'customers:manage', name: 'Manage Customers', category: 'CUSTOMERS', description: 'Create, update, archive customers' },
    { code: 'customers:read', name: 'View Customers', category: 'CUSTOMERS', description: 'View all customers list' },
    // Products, Plans, Pricing
    { code: 'products:manage', name: 'Manage Products & Variants', category: 'PRODUCTS', description: 'Create and configure products' },
    { code: 'plans:manage', name: 'Manage Plans & Pricing', category: 'PLANS', description: 'Create and configure subscription plans' },
    // Subscriptions
    { code: 'subscriptions:manage', name: 'Manage Subscriptions', category: 'SUBSCRIPTIONS', description: 'Create, pause, cancel subscriptions' },
    { code: 'subscriptions:read', name: 'View Subscriptions', category: 'SUBSCRIPTIONS', description: 'View subscriptions across all customers' },
    // Billing & Invoices
    { code: 'invoices:manage', name: 'Manage Invoices', category: 'BILLING', description: 'Generate and issue invoices' },
    { code: 'invoices:read', name: 'View Invoices', category: 'BILLING', description: 'View all invoices' },
    { code: 'payments:manage', name: 'Process Payments', category: 'BILLING', description: 'Process and refund payments' },
    // Tax & Discounts
    { code: 'taxes:manage', name: 'Configure Taxes', category: 'SETTINGS', description: 'Configure state and country tax rules' },
    { code: 'discounts:manage', name: 'Configure Discounts', category: 'SETTINGS', description: 'Create coupon codes and discount rules' },
  ];

  const permissions: Record<string, string> = {};
  for (const perm of permissionsData) {
    const created = await prisma.permission.create({ data: perm });
    permissions[perm.code] = created.id;
  }
  console.log(`✓ Seeded ${permissionsData.length} permissions`);

  // 3. Map Role Permissions
  // ADMIN gets everything
  for (const permId of Object.values(permissions)) {
    await prisma.rolePermission.create({
      data: { role: UserRole.ADMIN, permissionId: permId },
    });
  }

  // STAFF gets operational permissions (no staff creation, no tax/discount config)
  const staffPermCodes = [
    'users:read',
    'customers:manage',
    'customers:read',
    'subscriptions:manage',
    'subscriptions:read',
    'invoices:manage',
    'invoices:read',
    'payments:manage',
  ];
  for (const code of staffPermCodes) {
    if (permissions[code]) {
      await prisma.rolePermission.create({
        data: { role: UserRole.STAFF, permissionId: permissions[code] },
      });
    }
  }
  console.log('✓ Configured RBAC role-permission matrix');

  // 4. Seed Users
  const salt = await bcrypt.genSalt(10);
  const adminPasswordHash = await bcrypt.hash('Admin123!@#', salt);
  const staffPasswordHash = await bcrypt.hash('Staff123!@#', salt);
  const customerPasswordHash = await bcrypt.hash('Customer123!@#', salt);

  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@brightloop.com',
      name: 'System Administrator',
      passwordHash: adminPasswordHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  const staffUser = await prisma.user.create({
    data: {
      email: 'staff@brightloop.com',
      name: 'Operations Manager',
      passwordHash: staffPasswordHash,
      role: UserRole.STAFF,
      status: UserStatus.ACTIVE,
    },
  });

  const customerUser = await prisma.user.create({
    data: {
      email: 'customer@acme.com',
      name: 'Alice Henderson',
      passwordHash: customerPasswordHash,
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
    },
  });
  console.log('✓ Seeded admin, staff, and customer users');

  // 5. Seed Customers
  const customerAcme = await prisma.customer.create({
    data: {
      customerNumber: 'CUST-00001',
      companyName: 'Acme Enterprises Inc.',
      contactName: 'Alice Henderson',
      email: 'customer@acme.com',
      phone: '+1 (415) 555-0199',
      billingAddress: {
        street: '100 Market Street, Suite 400',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94105',
        country: 'US',
      },
      shippingAddress: {
        street: '100 Market Street, Suite 400',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94105',
        country: 'US',
      },
      currency: 'USD',
      taxExempt: false,
      status: CustomerStatus.ACTIVE,
      userId: customerUser.id,
    },
  });

  const customerTechNova = await prisma.customer.create({
    data: {
      customerNumber: 'CUST-00002',
      companyName: 'TechNova Solutions Ltd.',
      contactName: 'Bob Martinez',
      email: 'bob@technova.io',
      phone: '+1 (212) 555-0144',
      billingAddress: {
        street: '55 Hudson Yards',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      },
      currency: 'USD',
      status: CustomerStatus.ACTIVE,
    },
  });

  const customerCloudScale = await prisma.customer.create({
    data: {
      customerNumber: 'CUST-00003',
      companyName: 'CloudScale Global',
      contactName: 'Catherine Davies',
      email: 'catherine@cloudscale.co.uk',
      phone: '+44 20 7946 0912',
      billingAddress: {
        street: '10 Fenchurch Avenue',
        city: 'London',
        state: '',
        postalCode: 'EC3M 5AG',
        country: 'GB',
      },
      currency: 'GBP',
      status: CustomerStatus.ACTIVE,
    },
  });
  console.log('✓ Seeded 3 test customers');

  // 6. Products & Variants
  const productCloud = await prisma.product.create({
    data: {
      code: 'PROD-CLOUD',
      name: 'Brightloop Cloud Infrastructure',
      description: 'Enterprise scalable cloud hosting and microservices orchestration',
      category: 'INFRASTRUCTURE',
      active: true,
      variants: {
        create: [
          { sku: 'SKU-CLOUD-STANDARD', name: 'Standard Cloud Cluster', attributes: { vcpu: 4, ramGb: 16 } },
          { sku: 'SKU-CLOUD-ENTERPRISE', name: 'High-Availability Cluster', attributes: { vcpu: 16, ramGb: 64, ha: true } },
        ],
      },
    },
    include: { variants: true },
  });

  const productAnalytics = await prisma.product.create({
    data: {
      code: 'PROD-ANALYTICS',
      name: 'Brightloop Real-Time Analytics',
      description: 'Stream processing, business intelligence dashboards and export reporting',
      category: 'ANALYTICS',
      active: true,
      variants: {
        create: [
          { sku: 'SKU-ANALYTICS-CORE', name: 'Core BI Analytics', attributes: { retentionDays: 90 } },
        ],
      },
    },
    include: { variants: true },
  });
  console.log('✓ Seeded products and product variants');

  // 7. Subscription Plans & Pricing
  const planStarter = await prisma.subscriptionPlan.create({
    data: {
      productId: productCloud.id,
      variantId: productCloud.variants[0].id,
      code: 'PLAN-STARTER-M',
      name: 'Cloud Starter Monthly',
      description: 'Designed for early-stage teams with standard compute needs',
      active: true,
      trialPeriodDays: 14,
      billingInterval: BillingInterval.MONTH,
      intervalCount: 1,
      pricing: {
        create: {
          currency: 'USD',
          amount: 49.00,
          setupFee: 0.00,
          active: true,
        },
      },
    },
    include: { pricing: true },
  });

  const planPro = await prisma.subscriptionPlan.create({
    data: {
      productId: productCloud.id,
      variantId: productCloud.variants[1].id,
      code: 'PLAN-PRO-M',
      name: 'Cloud Professional Monthly',
      description: 'High-availability infrastructure with priority SLAs and round-the-clock telemetry',
      active: true,
      trialPeriodDays: 0,
      billingInterval: BillingInterval.MONTH,
      intervalCount: 1,
      pricing: {
        create: {
          currency: 'USD',
          amount: 199.00,
          setupFee: 50.00,
          active: true,
        },
      },
    },
    include: { pricing: true },
  });

  const planEnterpriseYearly = await prisma.subscriptionPlan.create({
    data: {
      productId: productAnalytics.id,
      variantId: productAnalytics.variants[0].id,
      code: 'PLAN-ENT-Y',
      name: 'Analytics Enterprise Annual',
      description: 'Full unmetered data stream ingest, custom retention, and SOC2 audit exports',
      active: true,
      trialPeriodDays: 30,
      billingInterval: BillingInterval.YEAR,
      intervalCount: 1,
      pricing: {
        create: {
          currency: 'USD',
          amount: 1999.00,
          setupFee: 0.00,
          active: true,
        },
      },
    },
    include: { pricing: true },
  });
  console.log('✓ Seeded subscription plans with decimal pricing');

  // 8. Tax Rules
  await prisma.taxRule.createMany({
    data: [
      { name: 'California State Sales Tax', country: 'US', state: 'CA', rate: 0.0825, priority: 1, active: true },
      { name: 'New York State Sales Tax', country: 'US', state: 'NY', rate: 0.08875, priority: 1, active: true },
      { name: 'United Kingdom Standard VAT', country: 'GB', state: null, rate: 0.2000, priority: 1, active: true },
    ],
  });
  console.log('✓ Seeded state and international tax rules');

  // 9. Discount Rules
  await prisma.discountRule.createMany({
    data: [
      {
        name: 'Welcome 20% Off Launch Special',
        code: 'WELCOME20',
        type: DiscountType.PERCENTAGE,
        value: 20.00,
        startsAt: new Date(),
        active: true,
      },
      {
        name: '$50 Off Professional Plans',
        code: 'SAVE50',
        type: DiscountType.FIXED_AMOUNT,
        value: 50.00,
        minOrderAmount: 100.00,
        startsAt: new Date(),
        active: true,
      },
    ],
  });
  console.log('✓ Seeded discount rules');

  // 10. Quotation Templates & Quotation
  const quoteTemplate = await prisma.quotationTemplate.create({
    data: {
      name: 'Standard Brightloop Master Services Agreement',
      description: 'Default quote template for recurring cloud subscriptions',
      defaultTerms: 'Net 30 payment terms. All subscriptions auto-renew at the end of billing period unless cancelled 30 days prior.',
      defaultNotes: 'Thank you for choosing Brightloop Software as your infrastructure partner.',
      active: true,
    },
  });

  const validUntilDate = new Date();
  validUntilDate.setDate(validUntilDate.getDate() + 30);

  await prisma.quotation.create({
    data: {
      quotationNumber: 'QUO-2026-0001',
      customerId: customerAcme.id,
      templateId: quoteTemplate.id,
      status: QuotationStatus.ACCEPTED,
      validUntil: validUntilDate,
      subtotal: 199.00,
      taxAmount: 16.42,
      discountAmount: 0.00,
      totalAmount: 215.42,
      currency: 'USD',
      notes: 'Custom dedicated instance configuration requested.',
      lines: {
        create: [
          {
            planId: planPro.id,
            description: 'Cloud Professional Monthly (1 month)',
            quantity: 1,
            unitPrice: 199.00,
            taxRate: 0.0825,
            lineTotal: 199.00,
          },
        ],
      },
    },
  });
  console.log('✓ Seeded quotation template and quotation');

  // 11. Subscriptions & Lines
  const now = new Date();
  const nextMonth = new Date(now);
  nextMonth.setMonth(nextMonth.getMonth() + 1);

  const subscriptionAcme = await prisma.subscription.create({
    data: {
      subscriptionNumber: 'SUB-2026-0001',
      customerId: customerAcme.id,
      planId: planPro.id,
      status: SubscriptionStatus.ACTIVE,
      currency: 'USD',
      currentPeriodStart: now,
      currentPeriodEnd: nextMonth,
      autoRenew: true,
      lines: {
        create: [
          {
            description: 'Cloud Professional Monthly Cluster',
            quantity: 1,
            unitPrice: 199.00,
            discountAmount: 0.00,
            taxRate: 0.0825,
            amount: 199.00,
          },
        ],
      },
    },
    include: { lines: true },
  });
  console.log('✓ Seeded active subscription with subscription lines');

  // 12. Invoices, Lines & Payments
  const invoicePaid = await prisma.invoice.create({
    data: {
      invoiceNumber: 'INV-2026-0001',
      customerId: customerAcme.id,
      subscriptionId: subscriptionAcme.id,
      status: InvoiceStatus.PAID,
      issueDate: now,
      dueDate: new Date(now.getTime() + 14 * 86400000),
      paidAt: now,
      subtotal: 199.00,
      taxAmount: 16.42,
      discountAmount: 0.00,
      totalAmount: 215.42,
      amountPaid: 215.42,
      amountDue: 0.00,
      currency: 'USD',
      lines: {
        create: [
          {
            subscriptionLineId: subscriptionAcme.lines[0].id,
            description: 'Cloud Professional Monthly Cluster (Current Period)',
            quantity: 1,
            unitPrice: 199.00,
            taxAmount: 16.42,
            discountAmount: 0.00,
            totalAmount: 215.42,
            periodStart: now,
            periodEnd: nextMonth,
          },
        ],
      },
    },
  });

  await prisma.payment.create({
    data: {
      paymentNumber: 'PAY-2026-0001',
      invoiceId: invoicePaid.id,
      customerId: customerAcme.id,
      amount: 215.42,
      currency: 'USD',
      status: PaymentStatus.SUCCEEDED,
      paymentMethod: PaymentMethod.STRIPE,
      providerTransactionId: 'ch_test_3OxfkX2eZvKYlo2C1',
      reference: 'Automatic subscription renewal invoice #INV-2026-0001',
      paidAt: now,
    },
  });

  // Open invoice for upcoming period
  const nextDueDate = new Date(nextMonth.getTime() + 14 * 86400000);
  await prisma.invoice.create({
    data: {
      invoiceNumber: 'INV-2026-0002',
      customerId: customerAcme.id,
      subscriptionId: subscriptionAcme.id,
      status: InvoiceStatus.OPEN,
      issueDate: nextMonth,
      dueDate: nextDueDate,
      subtotal: 199.00,
      taxAmount: 16.42,
      discountAmount: 0.00,
      totalAmount: 215.42,
      amountPaid: 0.00,
      amountDue: 215.42,
      currency: 'USD',
      lines: {
        create: [
          {
            description: 'Cloud Professional Monthly Cluster (Next Period)',
            quantity: 1,
            unitPrice: 199.00,
            taxAmount: 16.42,
            discountAmount: 0.00,
            totalAmount: 215.42,
          },
        ],
      },
    },
  });
  console.log('✓ Seeded paid invoice, payment record, and open invoice');

  // 13. Audit Log
  await prisma.auditLog.create({
    data: {
      userId: adminUser.id,
      action: 'SYSTEM_INITIALIZED',
      entityType: 'System',
      entityId: 'SYSTEM',
      newValues: {
        environment: 'development',
        seedVersion: '1.0.0',
        seededAt: now.toISOString(),
      },
      ipAddress: '127.0.0.1',
      userAgent: 'BrightloopSeedScript/1.0',
    },
  });
  console.log('✓ Seeded system initialization audit log');

  console.log('\n🎉 Database seed completed successfully!');
  console.log('Demo Credentials:');
  console.log('  Admin:    admin@brightloop.com     / Admin123!@#');
  console.log('  Staff:    staff@brightloop.com     / Staff123!@#');
  console.log('  Customer: customer@acme.com        / Customer123!@#');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
