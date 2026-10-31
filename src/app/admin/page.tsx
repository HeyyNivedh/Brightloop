'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Package,
  Layers,
  Calendar,
  Percent,
  Receipt,
  Plus,
  Search,
  Check,
  X,
  AlertTriangle,
  Edit3,
  Calculator,
} from 'lucide-react';

type Tab = 'products' | 'plans' | 'taxes' | 'discounts' | 'sandbox';

interface Product {
  id: string;
  code: string;
  name: string;
  description?: string;
  category?: string;
  active: boolean;
  variants: ProductVariant[];
  plans: SubscriptionPlan[];
  createdAt: string;
}

interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  name: string;
  attributes?: Record<string, unknown>;
  active: boolean;
}

interface PlanPricing {
  id: string;
  currency: string;
  amount: number | string;
  setupFee: number | string;
  active: boolean;
}

interface SubscriptionPlan {
  id: string;
  productId: string;
  variantId?: string;
  code: string;
  name: string;
  description?: string;
  billingInterval: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
  intervalCount: number;
  trialPeriodDays: number;
  active: boolean;
  pricing: PlanPricing[];
  product?: { name: string; code: string };
  variant?: { name: string; sku: string };
}

interface TaxRule {
  id: string;
  name: string;
  country: string;
  state?: string;
  postalCode?: string;
  rate: number | string;
  isCompound: boolean;
  priority: number;
  active: boolean;
  description?: string;
}

interface DiscountRule {
  id: string;
  name: string;
  code: string;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  value: number | string;
  minOrderAmount?: number | string;
  maxDiscountAmount?: number | string;
  startsAt: string;
  endsAt?: string;
  usageLimit?: number;
  usageCount: number;
  active: boolean;
}

interface AppliedTax {
  id: string;
  name: string;
  ratePercentage: number;
  taxAmount: number;
}

interface SandboxResult {
  productName?: string;
  variantName: string;
  variantCharge: number;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  discountStatus: string;
  discountReason: string;
  discountAmount: number;
  taxableBasis: number;
  taxAmount: number;
  appliedTaxes: AppliedTax[];
  grandTotal: number;
}

type EditableItem = {
  id: string;
  code?: string;
  name?: string;
  description?: string;
  category?: string;
  active?: boolean;
  country?: string;
  state?: string;
  postalCode?: string;
  rate?: number | string;
  isCompound?: boolean;
  priority?: number;
  type?: 'PERCENTAGE' | 'FIXED_AMOUNT';
  value?: number | string;
  minOrderAmount?: number | string;
  maxDiscountAmount?: number | string;
  endsAt?: string;
  usageLimit?: number;
} | null;

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('products');
  const [authToken, setAuthToken] = useState<string>('');
  const [currentRole, setCurrentRole] = useState<'ADMIN' | 'STAFF' | 'CUSTOMER'>('ADMIN');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Data states
  const [products, setProducts] = useState<Product[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [taxes, setTaxes] = useState<TaxRule[]>([]);
  const [discounts, setDiscounts] = useState<DiscountRule[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [intervalFilter, setIntervalFilter] = useState<string>('ALL');

  // Modals
  const [showProductModal, setShowProductModal] = useState<boolean>(false);
  const [showVariantModal, setShowVariantModal] = useState<boolean>(false);
  const [showPlanModal, setShowPlanModal] = useState<boolean>(false);
  const [showTaxModal, setShowTaxModal] = useState<boolean>(false);
  const [showDiscountModal, setShowDiscountModal] = useState<boolean>(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingItem, setEditingItem] = useState<EditableItem>(null);

  // Sandbox state
  const [sandboxProduct, setSandboxProduct] = useState<string>('');
  const [sandboxVariant, setSandboxVariant] = useState<string>('');
  const [sandboxQuantity, setSandboxQuantity] = useState<number>(1);
  const [sandboxDiscountCode, setSandboxDiscountCode] = useState<string>('');
  const [sandboxCountry, setSandboxCountry] = useState<string>('US');
  const [sandboxState, setSandboxState] = useState<string>('CA');
  const [sandboxResult, setSandboxResult] = useState<SandboxResult | null>(null);
  const [evaluating, setEvaluating] = useState<boolean>(false);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4500);
  }, []);

  // Login as demo user
  const loginAs = useCallback(async (email: string, pass: string, role: 'ADMIN' | 'STAFF' | 'CUSTOMER') => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass }),
      });
      const data = await res.json();
      if (res.ok && data.data?.token) {
        setAuthToken(data.data.token);
        setCurrentRole(role);
        showToast(`Authenticated as ${role} (${email})`, 'success');
      } else {
        showToast(data.error?.message || 'Login failed', 'error');
      }
    } catch {
      showToast('Login request failed', 'error');
    }
  }, [showToast]);

  const getHeaders = useCallback(() => {
    return {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    };
  }, [authToken]);

  // Fetch all data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const headers = getHeaders();
      const [prodRes, planRes, taxRes, discRes] = await Promise.all([
        fetch('/api/products', { headers }),
        fetch('/api/plans', { headers }),
        fetch('/api/reference/tax-rules', { headers }),
        fetch('/api/reference/discount-rules', { headers }),
      ]);

      if (prodRes.ok) {
        const prodData = await prodRes.json();
        setProducts(prodData.data || []);
      }
      if (planRes.ok) {
        const planData = await planRes.json();
        setPlans(planData.data || []);
      }
      if (taxRes.ok) {
        const taxData = await taxRes.json();
        setTaxes(taxData.data || []);
      }
      if (discRes.ok) {
        const discData = await discRes.json();
        setDiscounts(discData.data || []);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      showToast('Error loading records: ' + msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [getHeaders, showToast]);

  // Initial auto-login as ADMIN for full privileges
  useEffect(() => {
    let ignore = false;
    async function initAuth() {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'admin@brightloop.com', password: 'Admin123!@#' }),
        });
        const data = await res.json();
        if (!ignore && res.ok && data.data?.token) {
          setAuthToken(data.data.token);
          setCurrentRole('ADMIN');
        }
      } catch {
        // Ignored in initial mount
      }
    }
    initAuth();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!authToken) return;
    let ignore = false;
    async function loadData() {
      setLoading(true);
      try {
        const headers = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        };
        const [prodRes, planRes, taxRes, discRes] = await Promise.all([
          fetch('/api/products', { headers }),
          fetch('/api/plans', { headers }),
          fetch('/api/reference/tax-rules', { headers }),
          fetch('/api/reference/discount-rules', { headers }),
        ]);

        if (ignore) return;
        if (prodRes.ok) {
          const prodData = await prodRes.json();
          setProducts(prodData.data || []);
        }
        if (planRes.ok) {
          const planData = await planRes.json();
          setPlans(planData.data || []);
        }
        if (taxRes.ok) {
          const taxData = await taxRes.json();
          setTaxes(taxData.data || []);
        }
        if (discRes.ok) {
          const discData = await discRes.json();
          setDiscounts(discData.data || []);
        }
      } catch {
        // Ignored in effect
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    loadData();
    return () => {
      ignore = true;
    };
  }, [authToken]);

  // Helper for additional price from variant attributes
  const getAdditionalPrice = (attributes: Record<string, unknown> | null | undefined): number => {
    if (!attributes || typeof attributes !== 'object') return 0;
    const p = (attributes as Record<string, unknown>).additionalPrice ?? (attributes as Record<string, unknown>).additionalCharge;
    return typeof p === 'number' ? p : parseFloat(String(p)) || 0;
  };

  // Product submission
  const handleProductSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const body = {
      code: formData.get('code') as string,
      name: formData.get('name') as string,
      description: formData.get('description') as string,
      category: formData.get('category') as string,
      active: formData.get('active') === 'true',
    };

    try {
      const isEdit = Boolean(editingItem);
      const url = isEdit && editingItem ? `/api/products/${editingItem.id}` : '/api/products';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(body),
      });
      const resJson = await res.json();

      if (!res.ok) {
        throw new Error(resJson.error?.message || 'Failed to save product');
      }

      showToast(isEdit ? 'Product updated successfully' : 'Product created successfully');
      setShowProductModal(false);
      setEditingItem(null);
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save product';
      showToast(msg, 'error');
    }
  };

  // Variant submission
  const handleVariantSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedProduct) return;

    const formData = new FormData(e.currentTarget);
    const additionalPrice = parseFloat(formData.get('additionalPrice') as string) || 0;
    const body = {
      productId: selectedProduct.id,
      sku: formData.get('sku') as string,
      name: formData.get('name') as string,
      attributes: {
        additionalPrice,
        brand: formData.get('brand') || undefined,
        tier: formData.get('tier') || undefined,
      },
      active: formData.get('active') === 'true',
    };

    try {
      const res = await fetch(`/api/products/${selectedProduct.id}/variants`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body),
      });
      const resJson = await res.json();
      if (!res.ok) throw new Error(resJson.error?.message || 'Failed to add variant');

      showToast('Variant added successfully');
      setShowVariantModal(false);
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add variant';
      showToast(msg, 'error');
    }
  };

  // Plan submission
  const handlePlanSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const amount = parseFloat(formData.get('amount') as string) || 0;
    const setupFee = parseFloat(formData.get('setupFee') as string) || 0;

    const body = {
      productId: formData.get('productId') as string,
      variantId: (formData.get('variantId') as string) || undefined,
      code: formData.get('code') as string,
      name: formData.get('name') as string,
      description: formData.get('description') as string,
      billingInterval: formData.get('billingInterval') as string,
      intervalCount: parseInt(formData.get('intervalCount') as string, 10) || 1,
      trialPeriodDays: parseInt(formData.get('trialPeriodDays') as string, 10) || 0,
      active: formData.get('active') === 'true',
      pricing: [
        {
          currency: 'USD',
          amount,
          setupFee,
          active: true,
        },
      ],
    };

    try {
      const res = await fetch('/api/plans', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body),
      });
      const resJson = await res.json();
      if (!res.ok) throw new Error(resJson.error?.message || 'Failed to create plan');

      showToast('Subscription plan created successfully');
      setShowPlanModal(false);
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create plan';
      showToast(msg, 'error');
    }
  };

  // Tax submission
  const handleTaxSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const ratePercent = parseFloat(formData.get('rate') as string) || 0;
    const rateDecimal = ratePercent / 100; // convert 8.25% -> 0.0825

    const body = {
      name: formData.get('name') as string,
      country: (formData.get('country') as string).toUpperCase(),
      state: (formData.get('state') as string)?.toUpperCase() || undefined,
      postalCode: (formData.get('postalCode') as string) || undefined,
      rate: rateDecimal,
      isCompound: formData.get('isCompound') === 'true',
      priority: parseInt(formData.get('priority') as string, 10) || 0,
      active: formData.get('active') === 'true',
      description: formData.get('description') as string,
    };

    try {
      const isEdit = Boolean(editingItem);
      const url = isEdit ? `/api/reference/tax-rules/${editingItem?.id}` : '/api/reference/tax-rules';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(body),
      });
      const resJson = await res.json();
      if (!res.ok) throw new Error(resJson.error?.message || 'Failed to save tax rule');

      showToast(isEdit ? 'Tax rule updated' : 'Tax rule created');
      setShowTaxModal(false);
      setEditingItem(null);
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save tax rule';
      showToast(msg, 'error');
    }
  };

  // Discount submission
  const handleDiscountSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const value = parseFloat(formData.get('value') as string) || 0;
    const minOrder = formData.get('minOrderAmount') ? parseFloat(formData.get('minOrderAmount') as string) : undefined;
    const maxCap = formData.get('maxDiscountAmount') ? parseFloat(formData.get('maxDiscountAmount') as string) : undefined;
    const usageLimit = formData.get('usageLimit') ? parseInt(formData.get('usageLimit') as string, 10) : undefined;

    const body = {
      code: (formData.get('code') as string).toUpperCase(),
      name: formData.get('name') as string,
      type: formData.get('type') as 'PERCENTAGE' | 'FIXED_AMOUNT',
      value,
      minOrderAmount: minOrder,
      maxDiscountAmount: maxCap,
      startsAt: formData.get('startsAt') ? new Date(formData.get('startsAt') as string) : new Date(),
      endsAt: formData.get('endsAt') ? new Date(formData.get('endsAt') as string) : undefined,
      usageLimit,
      active: formData.get('active') === 'true',
    };

    try {
      const isEdit = Boolean(editingItem);
      const url = isEdit ? `/api/reference/discount-rules/${editingItem?.id}` : '/api/reference/discount-rules';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(body),
      });
      const resJson = await res.json();
      if (!res.ok) throw new Error(resJson.error?.message || 'Failed to save discount rule');

      showToast(isEdit ? 'Discount rule updated' : 'Discount rule created');
      setShowDiscountModal(false);
      setEditingItem(null);
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save discount rule';
      showToast(msg, 'error');
    }
  };

  // Run calculation sandbox
  const runSandboxCalculation = async () => {
    if (!sandboxProduct) {
      showToast('Please select a base product or plan', 'error');
      return;
    }
    setEvaluating(true);

    try {
      const prod = products.find((p) => p.id === sandboxProduct);
      const variant = prod?.variants.find((v) => v.id === sandboxVariant);

      const baseAmount = prod?.plans[0]?.pricing[0]?.amount
        ? Number(prod.plans[0].pricing[0].amount)
        : 100;

      const variantCharge = variant ? getAdditionalPrice(variant.attributes) : 0;
      const unitPrice = baseAmount + variantCharge;
      const subtotal = Math.round(unitPrice * sandboxQuantity * 100) / 100;

      // 1. Evaluate discount
      let discountAmount = 0;
      let discountStatus = 'None';
      let discountReason = '';

      if (sandboxDiscountCode) {
        const discRes = await fetch('/api/reference/discount-rules/evaluate', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            code: sandboxDiscountCode,
            orderAmount: subtotal,
            planId: prod?.plans[0]?.id,
            quantity: sandboxQuantity,
          }),
        });
        const discData = await discRes.json();
        if (discData.success && discData.data) {
          if (discData.data.eligible) {
            discountAmount = discData.data.discountAmount;
            discountStatus = 'Applied';
          } else {
            discountStatus = 'Ineligible';
            discountReason = discData.data.reason || 'Code not applicable';
          }
        }
      }

      const taxableBasis = Math.max(0, subtotal - discountAmount);

      // 2. Calculate tax
      const taxRes = await fetch('/api/reference/tax-rules/calculate', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          amount: taxableBasis,
          country: sandboxCountry,
          state: sandboxState || undefined,
        }),
      });
      const taxData = await taxRes.json();
      const taxAmount = taxData.data?.taxAmount || 0;
      const appliedTaxes = taxData.data?.appliedTaxes || [];

      const grandTotal = Math.round((taxableBasis + taxAmount) * 100) / 100;

      setSandboxResult({
        productName: prod?.name,
        variantName: variant?.name || 'Base Variant',
        variantCharge,
        unitPrice,
        quantity: sandboxQuantity,
        subtotal,
        discountStatus,
        discountReason,
        discountAmount,
        taxableBasis,
        taxAmount,
        appliedTaxes,
        grandTotal,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Calculation error';
      showToast('Calculation error: ' + msg, 'error');
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {notification && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border text-sm backdrop-blur-md transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-700 text-emerald-200'
              : 'bg-rose-950/90 border-rose-700 text-rose-200'
          }`}
        >
          {notification.type === 'success' ? <Check className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Role Switcher Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-slate-900 border border-slate-800 gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Current Role:</span>
          <span
            className={`px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider text-[11px] ${
              currentRole === 'ADMIN'
                ? 'bg-purple-950 text-purple-300 border border-purple-800'
                : currentRole === 'STAFF'
                ? 'bg-sky-950 text-sky-300 border border-sky-800'
                : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
            }`}
          >
            {currentRole}
          </span>
          <span className="text-slate-500 text-xs hidden md:inline">
            {currentRole === 'ADMIN'
              ? '(Full CRUD permissions)'
              : currentRole === 'STAFF'
              ? '(Operational Read-Only)'
              : '(Self-service view)'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Simulate Role:</span>
          <button
            onClick={() => loginAs('admin@brightloop.com', 'Admin123!@#', 'ADMIN')}
            className={`text-xs px-2.5 py-1 rounded-md border transition ${
              currentRole === 'ADMIN' ? 'bg-purple-900/60 border-purple-600 text-purple-200' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Admin
          </button>
          <button
            onClick={() => loginAs('staff@brightloop.com', 'Staff123!@#', 'STAFF')}
            className={`text-xs px-2.5 py-1 rounded-md border transition ${
              currentRole === 'STAFF' ? 'bg-sky-900/60 border-sky-600 text-sky-200' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Staff
          </button>
          <button
            onClick={() => loginAs('customer@acme.com', 'Customer123!@#', 'CUSTOMER')}
            className={`text-xs px-2.5 py-1 rounded-md border transition ${
              currentRole === 'CUSTOMER' ? 'bg-emerald-900/60 border-emerald-600 text-emerald-200' : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Customer
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        {[
          { id: 'products', label: 'Products & Variants', icon: Package, count: products.length },
          { id: 'plans', label: 'Subscription Plans', icon: Calendar, count: plans.length },
          { id: 'taxes', label: 'Tax Configuration', icon: Receipt, count: taxes.length },
          { id: 'discounts', label: 'Discount Rules', icon: Percent, count: discounts.length },
          { id: 'sandbox', label: 'Pricing Sandbox', icon: Calculator },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800/80'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    isActive ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ============================================================== */}
      {/* 1. PRODUCTS TAB */}
      {/* ============================================================== */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
              <input
                type="text"
                placeholder="Search products by code, name, category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {currentRole === 'ADMIN' && (
              <button
                onClick={() => {
                  setEditingItem(null);
                  setShowProductModal(true);
                }}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition shadow-md shadow-indigo-600/20"
              >
                <Plus className="w-4 h-4" />
                <span>Create Product</span>
              </button>
            )}
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-500">Loading product catalog...</div>
          ) : products.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400">
              <Package className="w-10 h-10 mx-auto text-slate-600 mb-2" />
              <p className="font-medium text-slate-300">No products configured yet</p>
              <p className="text-xs text-slate-500 mt-1">Create your first product to begin offering subscriptions.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {products
                .filter((p) =>
                  !searchQuery ||
                  p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  p.category?.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((product) => (
                  <div
                    key={product.id}
                    className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-indigo-300 font-semibold">
                            {product.code}
                          </span>
                          <h3 className="text-base font-bold text-white">{product.name}</h3>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                              product.active ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {product.active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        {product.description && (
                          <p className="text-xs text-slate-400 mt-1.5">{product.description}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {currentRole === 'ADMIN' && (
                          <>
                            <button
                              onClick={() => {
                                setSelectedProduct(product);
                                setShowVariantModal(true);
                              }}
                              className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition flex items-center gap-1.5"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add Variant</span>
                            </button>
                            <button
                              onClick={() => {
                                setEditingItem(product);
                                setShowProductModal(true);
                              }}
                              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                              title="Edit product"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Variants sub-list */}
                    <div className="mt-4">
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Configured Product Variants ({product.variants?.length || 0})</span>
                      </div>

                      {product.variants && product.variants.length > 0 ? (
                        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                          {product.variants.map((v) => {
                            const addPrice = getAdditionalPrice(v.attributes);
                            return (
                              <div
                                key={v.id}
                                className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between"
                              >
                                <div>
                                  <div className="text-xs font-semibold text-white">{v.name}</div>
                                  <div className="text-[11px] font-mono text-slate-500">{v.sku}</div>
                                </div>
                                <div className="text-right">
                                  <span
                                    className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                                      addPrice > 0
                                        ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                                        : 'bg-slate-800 text-slate-400'
                                    }`}
                                  >
                                    {addPrice > 0 ? `+ $${addPrice.toFixed(2)}` : 'Included'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 italic py-1">
                          No variants defined for this product yet.
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. PLANS TAB */}
      {/* ============================================================== */}
      {activeTab === 'plans' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
              {['ALL', 'DAY', 'WEEK', 'MONTH', 'YEAR'].map((interval) => (
                <button
                  key={interval}
                  onClick={() => setIntervalFilter(interval)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                    intervalFilter === interval
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {interval === 'ALL' ? 'All Intervals' : interval}
                </button>
              ))}
            </div>

            {currentRole === 'ADMIN' && (
              <button
                onClick={() => {
                  setEditingItem(null);
                  setShowPlanModal(true);
                }}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition shadow-md shadow-indigo-600/20"
              >
                <Plus className="w-4 h-4" />
                <span>Create Plan</span>
              </button>
            )}
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans
              .filter((p) => intervalFilter === 'ALL' || p.billingInterval === intervalFilter)
              .map((plan) => {
                const primaryPricing = plan.pricing && plan.pricing.length > 0 ? plan.pricing[0] : null;
                const priceNum = primaryPricing ? Number(primaryPricing.amount) : 0;
                return (
                  <div
                    key={plan.id}
                    className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-indigo-300 font-semibold">
                          {plan.code}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            plan.active ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {plan.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                      <div className="text-xs text-indigo-400 font-medium mt-0.5">
                        {plan.product?.name || 'Assigned Product'}
                      </div>
                      {plan.description && (
                        <p className="text-xs text-slate-400 mt-2 line-clamp-2">{plan.description}</p>
                      )}
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-800/80">
                      <div className="flex items-baseline justify-between">
                        <div>
                          <span className="text-2xl font-black text-white">
                            ${priceNum.toFixed(2)}
                          </span>
                          <span className="text-xs text-slate-400 ml-1">
                            / {plan.intervalCount > 1 ? `${plan.intervalCount} ` : ''}
                            {plan.billingInterval.toLowerCase()}
                          </span>
                        </div>
                        {plan.trialPeriodDays > 0 && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-medium">
                            {plan.trialPeriodDays}d trial
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. TAXES TAB */}
      {/* ============================================================== */}
      {activeTab === 'taxes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300">Configured Tax Jurisdictions</h2>
            {currentRole === 'ADMIN' && (
              <button
                onClick={() => {
                  setEditingItem(null);
                  setShowTaxModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition"
              >
                <Plus className="w-4 h-4" />
                <span>New Tax Rule</span>
              </button>
            )}
          </div>

          <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950/60 text-slate-400 text-xs border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-semibold">Tax Name</th>
                  <th className="py-3 px-4 font-semibold">Jurisdiction</th>
                  <th className="py-3 px-4 font-semibold">Effective Rate</th>
                  <th className="py-3 px-4 font-semibold">Calculation Mode</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {taxes.map((tax) => {
                  const rateNum = Number(tax.rate);
                  const percent = Math.round(rateNum * 10000) / 100;
                  return (
                    <tr key={tax.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 px-4 font-medium text-white">{tax.name}</td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-400">
                        {tax.country}{tax.state ? ` / ${tax.state}` : ''}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-semibold text-emerald-400">
                        {percent.toFixed(2)}%
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-400">
                        {tax.isCompound ? (
                          <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
                            Compound (Priority {tax.priority})
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                            Standard
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            tax.active ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {tax.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 4. DISCOUNTS TAB */}
      {/* ============================================================== */}
      {activeTab === 'discounts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300">Promotions and Discount Rules</h2>
            {currentRole === 'ADMIN' && (
              <button
                onClick={() => {
                  setEditingItem(null);
                  setShowDiscountModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition"
              >
                <Plus className="w-4 h-4" />
                <span>New Discount Code</span>
              </button>
            )}
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {discounts.map((disc) => {
              const valNum = Number(disc.value);
              const isExpired = disc.endsAt && new Date(disc.endsAt) < new Date();
              const isExhausted = disc.usageLimit !== undefined && disc.usageCount >= disc.usageLimit;

              return (
                <div
                  key={disc.id}
                  className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="font-mono text-sm px-2.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-bold">
                        {disc.code}
                      </span>
                      {isExpired ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-950 text-rose-400 border border-rose-800 font-medium">
                          Expired
                        </span>
                      ) : isExhausted ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-400 border border-amber-800 font-medium">
                          Limit Reached
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 font-medium">
                          Active
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-white mt-2">{disc.name}</h3>
                    <div className="text-2xl font-black text-emerald-400 mt-1">
                      {disc.type === 'PERCENTAGE' ? `${valNum}% OFF` : `$${valNum.toFixed(2)} OFF`}
                    </div>

                    <div className="text-xs text-slate-400 space-y-1 mt-3">
                      {disc.minOrderAmount && (
                        <div>Min order: ${Number(disc.minOrderAmount).toFixed(2)}</div>
                      )}
                      <div>
                        Redemptions: {disc.usageCount}
                        {disc.usageLimit ? ` / ${disc.usageLimit}` : ' (unlimited)'}
                      </div>
                      {disc.endsAt && (
                        <div>Valid until: {new Date(disc.endsAt).toLocaleDateString()}</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 5. PRICING & TAX SANDBOX TAB */}
      {/* ============================================================== */}
      {activeTab === 'sandbox' && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center gap-2 text-white font-bold text-base">
              <Calculator className="w-5 h-5 text-indigo-400" />
              <span>Interactive Pricing & Tax Simulator</span>
            </div>
            <p className="text-xs text-slate-400">
              Verify base prices, variant adjustments, promotion eligibility, and compounding tax calculations.
            </p>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Select Base Product</label>
                <select
                  value={sandboxProduct}
                  onChange={(e) => {
                    setSandboxProduct(e.target.value);
                    setSandboxVariant('');
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                >
                  <option value="">-- Choose a Product --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>

              {sandboxProduct && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Select Variant (Optional)</label>
                  <select
                    value={sandboxVariant}
                    onChange={(e) => setSandboxVariant(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="">Base Product (No Variant Adjustment)</option>
                    {products
                      .find((p) => p.id === sandboxProduct)
                      ?.variants.map((v) => {
                        const adj = getAdditionalPrice(v.attributes);
                        return (
                          <option key={v.id} value={v.id}>
                            {v.name} ({adj > 0 ? `+$${adj.toFixed(2)}` : 'Included'})
                          </option>
                        );
                      })}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={sandboxQuantity}
                    onChange={(e) => setSandboxQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Promo Code</label>
                  <input
                    type="text"
                    placeholder="e.g. WELCOME20"
                    value={sandboxDiscountCode}
                    onChange={(e) => setSandboxDiscountCode(e.target.value.toUpperCase())}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Destination Country</label>
                  <input
                    type="text"
                    value={sandboxCountry}
                    onChange={(e) => setSandboxCountry(e.target.value.toUpperCase())}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">State / Province</label>
                  <input
                    type="text"
                    value={sandboxState}
                    onChange={(e) => setSandboxState(e.target.value.toUpperCase())}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono text-slate-100"
                  />
                </div>
              </div>

              <button
                onClick={runSandboxCalculation}
                disabled={evaluating}
                className="w-full mt-3 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition shadow-lg shadow-indigo-600/30"
              >
                {evaluating ? 'Computing Pricing...' : 'Calculate Total Quotation'}
              </button>
            </div>
          </div>

          {/* Sandbox Calculation Result Card */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">
              Real-Time Pricing Breakdown
            </h3>

            {sandboxResult ? (
              <div className="space-y-3.5 text-sm">
                <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                  <span className="text-slate-400">Selected Product</span>
                  <span className="font-semibold text-white">{sandboxResult.productName}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                  <span className="text-slate-400">Variant</span>
                  <span className="text-slate-200">
                    {sandboxResult.variantName}
                    {sandboxResult.variantCharge > 0 && (
                      <span className="text-amber-400 ml-1">(+${sandboxResult.variantCharge.toFixed(2)})</span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                  <span className="text-slate-400">Unit Price &times; Qty ({sandboxResult.quantity})</span>
                  <span className="font-mono text-white">
                    ${sandboxResult.unitPrice.toFixed(2)} &times; {sandboxResult.quantity} = ${sandboxResult.subtotal.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                  <div>
                    <span className="text-slate-400">Discount</span>
                    {sandboxResult.discountStatus === 'Ineligible' && (
                      <span className="block text-[11px] text-rose-400">{sandboxResult.discountReason}</span>
                    )}
                  </div>
                  <span
                    className={`font-mono font-bold ${
                      sandboxResult.discountAmount > 0 ? 'text-emerald-400' : 'text-slate-500'
                    }`}
                  >
                    {sandboxResult.discountAmount > 0 ? `- $${sandboxResult.discountAmount.toFixed(2)}` : '$0.00'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                  <div>
                    <span className="text-slate-400">Taxable Subtotal</span>
                  </div>
                  <span className="font-mono text-white">${sandboxResult.taxableBasis.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                  <div>
                    <span className="text-slate-400">Applicable Taxes</span>
                    {sandboxResult.appliedTaxes.length > 0 && (
                      <div className="text-[11px] text-slate-500">
                        {sandboxResult.appliedTaxes.map((t: AppliedTax) => `${t.name} (${t.ratePercentage}%)`).join(', ')}
                      </div>
                    )}
                  </div>
                  <span className="font-mono text-indigo-300">
                    + ${sandboxResult.taxAmount.toFixed(2)}
                  </span>
                </div>

                <div className="pt-4 flex justify-between items-baseline">
                  <span className="text-base font-bold text-white">Final Estimated Total</span>
                  <span className="text-2xl font-black text-emerald-400 font-mono">
                    ${sandboxResult.grandTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
                <Calculator className="w-12 h-12 text-slate-700 mb-2" />
                <p>Run a calculation to verify the combined financial logic.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* PRODUCT CREATION/EDIT MODAL */}
      {/* ============================================================== */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">
                {editingItem ? 'Edit Product' : 'Create New Product'}
              </h3>
              <button
                onClick={() => setShowProductModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleProductSubmit} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Product Code (SKU prefix)</label>
                <input
                  type="text"
                  name="code"
                  required
                  defaultValue={editingItem?.code || ''}
                  disabled={Boolean(editingItem)}
                  placeholder="e.g. PROD-ENTERPRISE-ERP"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Product Name</label>
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue={editingItem?.name || ''}
                  placeholder="e.g. Enterprise ERP Platform"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Category</label>
                <input
                  type="text"
                  name="category"
                  defaultValue={editingItem?.category || ''}
                  placeholder="e.g. SOFTWARE, INFRASTRUCTURE"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
                <textarea
                  name="description"
                  rows={3}
                  defaultValue={editingItem?.description || ''}
                  placeholder="Describe the product and service capabilities..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Status</label>
                <select
                  name="active"
                  defaultValue={editingItem?.active !== false ? 'true' : 'false'}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-sm text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* VARIANT CREATION MODAL */}
      {/* ============================================================== */}
      {showVariantModal && selectedProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white">Add Variant</h3>
                <p className="text-xs text-indigo-400 font-medium">To: {selectedProduct.name}</p>
              </div>
              <button
                onClick={() => setShowVariantModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleVariantSubmit} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Variant SKU</label>
                <input
                  type="text"
                  name="sku"
                  required
                  placeholder="e.g. SKU-ERP-ODOO-560"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Variant Name</label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="e.g. Odoo Integration Edition"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Additional Unit Charge ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="additionalPrice"
                  placeholder="e.g. 560.00"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  This surcharge is automatically added on top of the base plan price when selected.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Status</label>
                <select
                  name="active"
                  defaultValue="true"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowVariantModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-sm text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition"
                >
                  Save Variant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* PLAN CREATION MODAL */}
      {/* ============================================================== */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">Create Subscription Plan</h3>
              <button
                onClick={() => setShowPlanModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePlanSubmit} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Parent Product</label>
                <select
                  name="productId"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                >
                  <option value="">-- Choose Product --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Plan Code</label>
                  <input
                    type="text"
                    name="code"
                    required
                    placeholder="e.g. PLAN-PRO-YEARLY"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Plan Name</label>
                  <input
                    type="text"
                    name="name"
                    required
                    placeholder="e.g. Professional Yearly"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Billing Interval</label>
                  <select
                    name="billingInterval"
                    defaultValue="MONTH"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="DAY">Daily</option>
                    <option value="WEEK">Weekly</option>
                    <option value="MONTH">Monthly</option>
                    <option value="YEAR">Yearly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Interval Count</label>
                  <input
                    type="number"
                    min="1"
                    name="intervalCount"
                    defaultValue="1"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Recurring Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    name="amount"
                    placeholder="e.g. 149.00"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Setup Fee ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="setupFee"
                    defaultValue="0"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Trial Period (Days)</label>
                <input
                  type="number"
                  min="0"
                  name="trialPeriodDays"
                  defaultValue="0"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
                <textarea
                  name="description"
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-sm text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition"
                >
                  Save Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAX CREATION/EDIT MODAL */}
      {/* ============================================================== */}
      {showTaxModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">
                {editingItem ? 'Edit Tax Rule' : 'New Tax Rule'}
              </h3>
              <button
                onClick={() => setShowTaxModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleTaxSubmit} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Tax Rule Name</label>
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue={editingItem?.name || ''}
                  placeholder="e.g. California State Tax"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Country (ISO-2)</label>
                  <input
                    type="text"
                    name="country"
                    required
                    maxLength={2}
                    defaultValue={editingItem?.country || 'US'}
                    placeholder="US"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">State / Province</label>
                  <input
                    type="text"
                    name="state"
                    defaultValue={editingItem?.state || ''}
                    placeholder="CA"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Tax Rate (%)</label>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  max="100"
                  required
                  name="rate"
                  defaultValue={editingItem ? Number(editingItem.rate) * 100 : ''}
                  placeholder="e.g. 8.25 for 8.25%"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Compound Tax</label>
                  <select
                    name="isCompound"
                    defaultValue={editingItem?.isCompound ? 'true' : 'false'}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="false">Standard (Non-Compound)</option>
                    <option value="true">Compound</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Priority Order</label>
                  <input
                    type="number"
                    name="priority"
                    defaultValue={editingItem?.priority ?? 0}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTaxModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-sm text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition"
                >
                  Save Tax Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* DISCOUNT CREATION/EDIT MODAL */}
      {/* ============================================================== */}
      {showDiscountModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">
                {editingItem ? 'Edit Discount Rule' : 'New Discount Rule'}
              </h3>
              <button
                onClick={() => setShowDiscountModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDiscountSubmit} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Promo Code</label>
                  <input
                    type="text"
                    name="code"
                    required
                    defaultValue={editingItem?.code || ''}
                    placeholder="e.g. SAVE25"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Discount Name</label>
                  <input
                    type="text"
                    name="name"
                    required
                    defaultValue={editingItem?.name || ''}
                    placeholder="e.g. Spring Sale"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Discount Type</label>
                  <select
                    name="type"
                    defaultValue={editingItem?.type || 'PERCENTAGE'}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FIXED_AMOUNT">Fixed Amount ($)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Discount Value</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    name="value"
                    defaultValue={editingItem ? Number(editingItem.value) : ''}
                    placeholder="e.g. 20 for 20% or $20"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Min Order Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="minOrderAmount"
                    defaultValue={editingItem?.minOrderAmount ? Number(editingItem.minOrderAmount) : ''}
                    placeholder="Optional threshold"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Max Cap Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="maxDiscountAmount"
                    defaultValue={editingItem?.maxDiscountAmount ? Number(editingItem.maxDiscountAmount) : ''}
                    placeholder="Optional cap for %"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Max Total Uses</label>
                  <input
                    type="number"
                    min="1"
                    name="usageLimit"
                    defaultValue={editingItem?.usageLimit || ''}
                    placeholder="Blank for unlimited"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Expiry Date</label>
                  <input
                    type="date"
                    name="endsAt"
                    defaultValue={editingItem?.endsAt ? new Date(editingItem.endsAt).toISOString().split('T')[0] : ''}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowDiscountModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-sm text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition"
                >
                  Save Discount
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
