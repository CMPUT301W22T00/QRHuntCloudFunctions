const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const { onCreateQr } = require("./createQr");
const { onDeleteQr } = require("./deleteQr");
const { leaderboardRanker } = require("./leaderboard");

const QR_ENDPOINT = "users/{userId}/qrCodes/{qrId}";

exports.createQr = functions.firestore.document(QR_ENDPOINT).onCreate(onCreateQr);
exports.deleteQr = functions.firestore.document(QR_ENDPOINT).onDelete(onDeleteQr);
exports.leaderboardRanker = functions.pubsub.schedule("every 4 minutes").onRun(leaderboardRanker);

require("@google-cloud/debug-agent").start({ serviceContext: { enableCanary: false } });
