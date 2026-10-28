# Mess App – API Documentation

Base URL: `http://localhost:5000/api/v1`
Auth: `Authorization: Bearer <token>` (token returned by register/login)
Every response: `{ "success": true|false, "message": "...", "data": ..., "meta"?: ..., "errors"?: [...] }`

---

## 1. Concepts

**Roles:** `ADMIN`, `MAVSHI`, `DELIVERY`, `CUSTOMER`. Each route is protected by a role guard.

**Two different "subscriptions":**
- *Mavshi plan* – platform plan (name, duration, fee) the admin assigns to a mavshi while approving. Managed in `/admin/plans`.
- *Customer meal plan* – `DAY` (1 day), `WEEK` (7 days), `MONTH` (30 days) chosen by the customer when ordering. Price = `price` / `weeklyPrice` (default price×7) / `monthlyPrice` (default price×30) of the menu item.

**Pricing & delivery charge:** Menu prices never include delivery. Delivery charge is set only by admin (`PUT /admin/settings`) and is shown as a separate line in the order summary (`/customer/orders/preview`) and the order.

**Mavshi status:** `PENDING` -> `ACTIVE` (accepted) or `REJECTED` (with `rejectionReason`). Rejected mavshi can edit profile (`PUT /mavshi/profile`) to re-submit.

**Order status flow**
```
ONLINE: PAYMENT_PENDING -> (payment verified) -> PLACED
COD:                                              PLACED
PLACED -> ACCEPTED (admin)  | REJECTED (admin, reason, auto refund if paid online) | CANCELLED (customer)
ACCEPTED -> PREPARING -> READY (mavshi)
ACCEPTED/PREPARING/READY -> OUT_FOR_DELIVERY (delivery boy pickup) -> DELIVERED
```
Admin assigns a delivery boy (same pincode) when accepting or later.

**ETA & traffic:** On accept, ETA = `baseDeliveryMinutes` (default 25). Delivery boy reports traffic (`NORMAL/MODERATE/HEAVY`) and ETA becomes base + extra minutes (defaults 0/10/20); customer is notified.

**Notifications:** every important event is stored (`/notifications`) and sent as FCM push to the user's registered token.

---

## 2. Auth (public)

| Method | Endpoint | Purpose / why useful |
|---|---|---|
| POST | `/auth/register/mavshi` | Mess owner signs up with name, mobile, address, pincode, cooking experience, mess start month/year and food pricing. Status starts `PENDING` and admins are notified. |
| POST | `/auth/register/delivery` | Delivery boy signs up. Pincode must already have an approved mess (see `/public/service-areas`). |
| POST | `/auth/register/customer` | Customer signs up with basic details (+ password while OTP is off). |
| POST | `/auth/login` | `{mobile,password}` for admin, mavshi, delivery (and customer while OTP is off). Mavshi response contains `notice` (pending / rejected + reason). |
| POST | `/auth/otp/send` | (Optional, `OTP_ENABLED=true`) send OTP to customer. |
| POST | `/auth/otp/verify` | Verify OTP -> token. |
| POST | `/auth/otp/firebase-login` | Alternative OTP: app verifies phone with Firebase Phone Auth, sends `idToken`, gets our token. No SMS provider needed. |

Mavshi register body:
```json
{
  "fullName": "Sunita Patil", "mobile": "9876543210", "password": "Pass@1234",
  "address": "Shivaji Nagar, Near Temple", "areaName": "Shivaji Nagar", "pincode": "416001",
  "messName": "Sunita Mess", "cookingExperienceYears": 8, "messStartMonth": 6, "messStartYear": 2019,
  "pricing": [
    { "name": "Veg Thali", "mealType": "LUNCH", "foodType": "VEG", "price": 80, "weeklyPrice": 520, "monthlyPrice": 2100 }
  ]
}
```

`GET /public/service-areas` – list of pincodes/areas with approved mess (for delivery registration and customer area picker).

---

## 3. Common (any logged-in user)

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/users/me` | Current profile |
| PUT | `/users/me/fcm-token` `{token}` | Save device token so push notifications work |
| PUT | `/users/me/password` | Change password |
| POST | `/users/me/photo` (multipart `photo`) | Profile photo to Cloudinary |
| GET | `/notifications` | In-app notification list (+ `meta.unread`) |
| PATCH | `/notifications/:id/read`, `/notifications/read-all` | Mark read |

---

## 4. Admin (`ADMIN` only)

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/admin/dashboard` | Counts: customers, mavshis, pending requests, orders |
| GET | `/admin/mavshis?status=PENDING&pincode=&page=&limit=` | Review mavshi requests |
| GET | `/admin/mavshis/:id` | Mavshi details + menu/pricing |
| PATCH | `/admin/mavshis/:id/approve` `{planId?}` | Accept. If `planId` is given the plan is assigned directly; if the plan is missing/inactive the request is **not** approved (400) so admin can pick another plan or reject. Mavshi gets notification. |
| PATCH | `/admin/mavshis/:id/reject` `{reason}` | Reject; reason is saved and pushed to mavshi (also shown on login/`/mavshi/status`). |
| PATCH | `/admin/mavshis/:id/plan` `{planId}` | Change plan later |
| GET/POST | `/admin/plans` | List / create mavshi plans |
| PUT/DELETE | `/admin/plans/:id` | Update / delete plan |
| GET | `/admin/users?role=&status=&pincode=&search=` | Manage all roles |
| POST | `/admin/users` | Create any user incl. another admin |
| GET/PUT/DELETE | `/admin/users/:id` | View / edit / delete |
| PATCH | `/admin/users/:id/status` `{status: ACTIVE|BLOCKED, reason}` | Block / unblock (takes effect immediately) |
| GET | `/admin/orders?status=&pincode=` | All orders |
| GET | `/admin/orders/:id` | Order detail |
| PATCH | `/admin/orders/:id/accept` `{deliveryBoyId?}` | Accept order, set ETA (25 min), notify customer + mavshi |
| PATCH | `/admin/orders/:id/reject` `{reason}` | Reject with reason. Paid online orders are **auto refunded** via Razorpay first; if refund fails the order stays `PLACED` for retry. |
| PATCH | `/admin/orders/:id/assign` `{deliveryBoyId}` | Assign delivery boy (must be active, available, same pincode) |
| GET | `/admin/delivery-boys/available?pincode=` | Pick a delivery boy |
| GET/PUT | `/admin/settings` | **Delivery charge** (admin only), base delivery minutes, traffic extra minutes |

---

## 5. Mavshi (`MAVSHI`)

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/mavshi/status` | Approval status, rejection reason, assigned plan (works while pending) |
| PUT | `/mavshi/profile` | Edit details; rejected mavshi is re-submitted for review |
| GET | `/mavshi/menu` | My menu & pricing |
| POST | `/mavshi/menu` | Add item (approved only) |
| PUT/DELETE | `/mavshi/menu/:id` | Edit price / availability / delete |
| POST | `/mavshi/menu/:id/image` (multipart `image`) | Food photo to Cloudinary |
| GET | `/mavshi/orders?status=` | Orders accepted by admin for my mess |
| PATCH | `/mavshi/orders/:id/status` `{status: PREPARING|READY}` | Update kitchen progress, customer & delivery boy notified |

---

## 6. Delivery boy (`DELIVERY`)

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/delivery/orders?type=active|history` | Orders assigned by admin |
| GET | `/delivery/orders/:id` | Detail (address, items, payment method) |
| PATCH | `/delivery/orders/:id/pickup` | Mark out for delivery |
| PATCH | `/delivery/orders/:id/deliver` | Mark delivered (COD is marked paid) |
| PATCH | `/delivery/orders/:id/traffic` `{level, note}` | Report traffic -> new ETA, customer notified |
| PATCH | `/delivery/location` `{lat,lng,areaName}` | Live location with area name; shown to customer |
| PATCH | `/delivery/availability` `{isAvailable}` | Go on/off duty |

---

## 7. Customer (`CUSTOMER`)

| Method | Endpoint | Purpose |
|---|---|---|
| PUT | `/customer/profile` | Update details |
| GET | `/customer/messes?pincode=` | Mess available in my area (default: my pincode) |
| GET | `/customer/messes/:id` | Menu with `prices: {DAY, WEEK, MONTH}` (no delivery charge) |
| POST | `/customer/orders/preview` | Price summary: subtotal + delivery charge + total |
| POST | `/customer/orders` | Place order. `ONLINE` returns Razorpay `{keyId, orderId, amount}` for the app checkout; `COD` goes straight to admin |
| POST | `/payments/verify` | After Razorpay checkout, send `orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature`. Signature verified server side, order becomes `PLACED` |
| POST | `/payments/webhook` | Razorpay webhook (`payment.captured`) safety net. Set URL in Razorpay dashboard + `RAZORPAY_WEBHOOK_SECRET` |
| GET | `/customer/orders`, `/customer/orders/:id` | My orders; shows rejection reason & refund info |
| GET | `/customer/orders/:id/tracking` | ETA message ("delivered in about 25 min" / traffic delay), delivery boy and current area name, timeline |
| POST | `/customer/orders/:id/cancel` | Cancel before admin accepts (auto refund if paid) |

Create order body:
```json
{
  "mavshiId": "abc123", "plan": "WEEK", "startDate": "2026-11-01",
  "items": [{ "menuItemId": "item1", "quantity": 1 }],
  "delivery": { "address": "Flat 4, Rajarampuri", "pincode": "416001", "areaName": "Rajarampuri" },
  "paymentMethod": "ONLINE"
}
```

---

## 8. Firestore collections
`users` (all roles, `role` field), `mobile_index` (unique mobile), `menuItems`, `orders`, `plans`, `notifications`, `otps`, `settings/global`.

## 9. Errors
`400` bad request, `401` not logged in, `403` wrong role / blocked / mavshi not approved, `404`, `409` conflict (duplicate mobile, wrong order state), `422` validation (`errors[]`), `429` rate limit, `502` payment/refund/upload provider failure.

## 10. Security notes
- Never commit `.env` or service account JSON. Rotate any key that was pasted in chat/screenshots.
- Prices and delivery charge are always calculated on the server.
- Payment signatures and webhooks are verified with HMAC.
- Passwords are bcrypt hashed; blocked users are rejected on the next request.
