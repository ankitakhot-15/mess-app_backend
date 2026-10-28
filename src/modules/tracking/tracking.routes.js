const router = require("express").Router();
const auth = require("../../middleware/auth");
const controller = require("./tracking.controller");

// Show what your auth middleware really exports (helps if names differ)
console.log("[tracking] auth exports:", Object.keys(auth));

// Try the common names
const authenticate =
  auth.authenticate ||
  auth.protect ||
  auth.verifyToken ||
  auth.auth ||
  auth.requireAuth ||
  auth.isAuthenticated ||
  (typeof auth === "function" ? auth : undefined);

const authorize =
  auth.authorize ||
  auth.allowRoles ||
  auth.restrictTo ||
  auth.requireRole ||
  auth.roleGuard ||
  auth.authorizeRoles ||
  auth.checkRole;

if (typeof authenticate !== "function") {
  throw new Error(
    "[tracking] Could not find the auth middleware. Exports found: " +
      Object.keys(auth).join(", "),
  );
}

const handlers = [authenticate];

// Role guard: most projects use authorize('CUSTOMER') or authorize(['CUSTOMER'])
if (typeof authorize === "function") {
  const guard = authorize("CUSTOMER");
  if (typeof guard === "function") handlers.push(guard);
}

router.get("/orders/:id/tracking", ...handlers, controller.trackOrder);

module.exports = router;
