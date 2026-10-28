const path = require('path');
const admin = require('firebase-admin');
const env = require('./env');

let credential;
if (env.firebase.serviceAccountBase64) {
  credential = admin.credential.cert(
    JSON.parse(Buffer.from(env.firebase.serviceAccountBase64, 'base64').toString('utf8'))
  );
} else if (env.firebase.serviceAccountPath) {
  credential = admin.credential.cert(require(path.resolve(env.firebase.serviceAccountPath)));
} else {
  credential = admin.credential.applicationDefault();
}

admin.initializeApp({ credential, projectId: env.firebase.projectId });

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

module.exports = { admin, db, messaging: admin.messaging(), auth: admin.auth() };
