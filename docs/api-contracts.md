# API Contracts & Specification: Brightloop Backend

This document defines the REST API contracts, request payloads, response envelopes, error schemas, and authorization requirements across all modules in Brightloop Software.

---

## 1. Standard Response Formats

All API endpoints strictly return standardized JSON envelopes.

### 1.1 Success Response (`ApiSuccessResponse<T>`)
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### 1.2 Error Response (`ApiErrorResponse`)
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed for one or more fields",
    "details": [
      { "field": "email", "message": "Invalid email address format" }
    ]
  }
}
```

### Standard Error Codes
| HTTP Status | Error Code | Description |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request body or query parameters failed Zod schema validation |
| 401 | `UNAUTHORIZED` | Missing, invalid, or expired session token |
| 403 | `FORBIDDEN` | Caller's role or scope lacks permission for this action |
| 404 | `NOT_FOUND` | Resource could not be located |
| 409 | `CONFLICT` / `DUPLICATE_RECORD` | Unique constraint violated (e.g. duplicate email) |
| 500 | `INTERNAL_SERVER_ERROR` | Unexpected server fault (details masked in production) |

---

## 2. Authentication & Session Management

Authentication supports both **Authorization Header** (`Bearer <token>`) and **HTTP-only Cookies** (`brightloop_session=<token>`).

### `POST /api/auth/register`
Creates a customer account, linked customer profile, and returns an authenticated session.
- **Access**: Public
- **Request Body**:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!@#",
  "name": "Jane Doe",
  "companyName": "Acme Inc",
  "phone": "+1 555-0199"
}
```
- **Response**: `201 Created` with `{ user, token }` and `Set-Cookie` header.

### `POST /api/auth/login`
Authenticates existing accounts with email and password.
- **Access**: Public
- **Request Body**:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!@#"
}
```
- **Response**: `200 OK` with `{ user, token }` and `Set-Cookie` header.

### `POST /api/auth/logout`
Terminates current session and clears the session cookie.
- **Access**: Authenticated
- **Response**: `200 OK` with `{ message: "Logged out successfully." }`.

### `GET /api/auth/me`
Fetches current session user, role, permissions, and linked customer record.
- **Access**: Authenticated (`CUSTOMER`, `STAFF`, `ADMIN`)
- **Response**: `200 OK` with `{ user, permissions }`.

### `POST /api/auth/forgot-password`
Generates a time-limited (60 min) single-use reset token and dispatches an email.
- **Access**: Public
- **Security**: Never reveals whether an email account exists in the database.
- **Request Body**:
```json
{ "email": "user@example.com" }
```
- **Response**: `200 OK` with `{ message: "If an account exists with this email address, a password reset link has been dispatched." }`.

### `POST /api/auth/reset-password`
Consumes the single-use reset token and securely updates the user's password.
- **Access**: Public
- **Request Body**:
```json
{
  "token": "a66504e16955560bae9d9cb06663e1db...",
  "newPassword": "NewStrongPass999!@#"
}
```
- **Response**: `200 OK` with `{ message: "Password has been reset successfully." }`.

---

## 3. User & Staff Management

### `GET /api/users`
Lists system users with pagination, role filters, and full-text search.
- **Access**: `ADMIN`, `STAFF`
- **Query Parameters**:
  - `page` (default: 1)
  - `limit` (default: 20, max: 100)
  - `role` (`ADMIN`, `STAFF`, `CUSTOMER`)
  - `status` (`ACTIVE`, `SUSPENDED`, `PENDING`)
  - `search` (searches name and email)

### `POST /api/users/staff`
Creates staff or admin accounts.
- **Access**: `ADMIN` only (STAFF is strictly forbidden with 403)
- **Request Body**:
```json
{
  "email": "ops@brightloop.com",
  "name": "Alex Mercer",
  "password": "StaffPassword123!@#",
  "role": "STAFF"
}
```
- **Response**: `201 Created`

### `GET /api/users/:id` & `PATCH /api/users/:id`
Inspect or update user details.
- **Access**: `ADMIN`, `STAFF` (or user updating their own name). Only `ADMIN` can update `role` or `status`.

---

## 4. Customer Management & Data Isolation

### `GET /api/customers`
- **Access**: Authenticated
- **Isolation Enforcement**:
  - If caller is `CUSTOMER`: Automatically scoped to return **only** their own customer record (`[{ id: session.customerId, ... }]`). Cannot inspect other customers.
  - If caller is `ADMIN` or `STAFF`: Returns all customers with count metrics and pagination.

### `POST /api/customers`
Creates a customer profile.
- **Access**: `ADMIN`, `STAFF`
- **Request Body**:
```json
{
  "contactName": "Robert Chen",
  "email": "robert@technova.io",
  "companyName": "TechNova Solutions",
  "phone": "+1 (415) 555-0144",
  "currency": "USD",
  "taxExempt": false,
  "billingAddress": {
    "street": "100 Market St",
    "city": "San Francisco",
    "state": "CA",
    "postalCode": "94105",
    "country": "US"
  }
}
```

### `GET /api/customers/:id`
Retrieves a customer profile including active subscriptions, invoices, and payments.
- **Access**: `ADMIN`, `STAFF`, or `CUSTOMER` where `id === session.customerId`.
- **IDOR Protection**: If customer attempts to access an ID that is not theirs, server returns `403 Forbidden`.

### `PATCH /api/customers/:id`
Updates customer details.
- **Access**: `ADMIN`, `STAFF`, or customer owner.
- Customers can only update contact information and addresses; administrative fields (`status`, `taxExempt`, `currency`) are rejected with `403 Forbidden` if submitted by a customer.

---

## 5. Reference Data Catalog

### `GET /api/reference/roles`
Returns all roles, permissions, and hierarchy levels.

### `GET /api/reference/plans`
Returns active subscription plans with variants and pricing.

### `GET /api/reference/tax-rules`
Returns active tax rules matching optional `?country=US&state=CA`.

### `POST /api/reference/tax-rules`
- **Access**: `ADMIN` only.

### `GET /api/reference/discount-rules`
Returns active discount rules or validates coupon code via `?code=WELCOME20`.

### `POST /api/reference/discount-rules`
- **Access**: `ADMIN` only.

---

## 6. Audit Trail

### `GET /api/audit-logs`
Inspects security audit trail with filtering by `entityType`, `action`, `userId`, and `search`.
- **Access**: `ADMIN` only.
