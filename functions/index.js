const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const {onCreateQr} = require("./createQr");
const {onDeleteQr} = require("./deleteQr");

const QR_ENDPOINT = "users/{userId}/qrCodes/{qrId}";

exports.createQr = functions.firestore.document(QR_ENDPOINT).onCreate(onCreateQr);
exports.deleteQr = functions.firestore.document(QR_ENDPOINT).onDelete(onDeleteQr);

require('@google-cloud/debug-agent').start({serviceContext: {enableCanary: false}});
