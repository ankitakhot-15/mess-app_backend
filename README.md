# Mess App Backend (Node.js + Express + Firebase Firestore)

Roles: **ADMIN, MAVSHI (mess owner), DELIVERY (delivery boy), CUSTOMER**

## Quick start
1. `npm install`
2. Copy `.env.example` to `.env` and fill the values (see "Keys" below).
3. Download the Firebase **service account JSON** (Firebase Console > Project settings > Service accounts > Generate new private key), save it as `serviceAccountKey.json` in this folder.
4. `npm run seed`  (creates first admin, default settings, sample plans)
5. `npm run dev`  -> http://localhost:5000/health

Full API list with the purpose of every endpoint: **docs/API_DOCUMENTATION.md**

## Keys you must provide
| Service | What is needed |
|---|---|
| Razorpay | `RAZORPAY_KEY_ID` (starts `rzp_test_`/`rzp_live_`) **and** `RAZORPAY_KEY_SECRET` (+ webhook secret for webhooks) |
| Cloudinary | cloud name `onngxf4v` + `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET` |
| Firebase | service account JSON (Firestore + push). The `google-services.json` and web push (VAPID) key are for the **Android app**, not the server |

## Structure
```
src/
  config/        env, firebase, cloudinary, razorpay
  constants/     roles, statuses
  middleware/    auth (JWT + role guard), validate (Joi), upload (multer), error
  repositories/  BaseRepository (generic Firestore CRUD) + collections
  services/      order, payment, notification(FCM), settings, cloudinary, sms
  utils/         ApiError, asyncHandler, response, helpers, validators
  modules/       auth, user, notification, public, admin, mavshi, delivery, customer, payment
scripts/seed.js
```
