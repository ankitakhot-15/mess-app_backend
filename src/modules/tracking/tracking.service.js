// ADJUST: path/export of your firebase config (needs to give a Firestore `db`)
const firebase = require("../../config/firebase");
const db = firebase.db || firebase.firestore || firebase;
const ApiError = require("../../utils/ApiError");

const ORDERS = "orders";
const USERS = "users";

const pick = (obj, keys) => {
  for (const k of keys)
    if (obj && obj[k] != null && obj[k] !== "") return obj[k];
  return null;
};

const toIso = (v) => {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate().toISOString();
  return new Date(v).toISOString();
};

const toPoint = (o) => {
  if (!o) return null;
  const lat = pick(o, ["lat", "latitude"]);
  const lng = pick(o, ["lng", "longitude"]);
  return lat != null && lng != null
    ? { lat: Number(lat), lng: Number(lng) }
    : null;
};

async function trackOrder(customerId, orderId) {
  const orderSnap = await db.collection(ORDERS).doc(orderId).get();
  if (!orderSnap.exists) throw new ApiError(404, "Order not found");
  const order = orderSnap.data();

  const ownerId = pick(order, ["customerId", "customer", "userId"]);
  if (String(ownerId) !== String(customerId))
    throw new ApiError(403, "Not allowed");

  const deliveryBoyId = pick(order, [
    "deliveryBoyId",
    "deliveryBoy",
    "deliveryId",
  ]);
  if (!deliveryBoyId) throw new ApiError(404, "Delivery boy not assigned yet");

  const userSnap = await db.collection(USERS).doc(String(deliveryBoyId)).get();
  if (!userSnap.exists) throw new ApiError(404, "Delivery boy not found");
  const u = userSnap.data();

  const loc = pick(u, ["location", "currentLocation", "liveLocation"]) || u;
  const point = toPoint(loc);
  if (!point) throw new ApiError(404, "Location not available");

  // drop-off coordinates, if the order stores them (otherwise the app geocodes the address)
  const drop =
    toPoint(
      pick(order, [
        "dropLocation",
        "deliveryLocation",
        "addressLocation",
        "location",
      ]),
    ) || toPoint(order);

  return {
    lat: point.lat,
    lng: point.lng,
    areaName: pick(loc, ["areaName", "area"]) || "",
    updatedAt: toIso(pick(loc, ["updatedAt", "locationUpdatedAt"])),
    status: order.status || null,
    deliveryBoy: {
      name: pick(u, ["fullName", "name"]) || "",
      mobile: pick(u, ["mobile", "phone", "mobileNumber"]) || "",
    },
    drop,
  };
}

module.exports = { trackOrder };
