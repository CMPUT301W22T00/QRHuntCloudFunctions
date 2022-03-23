const functions = require("firebase-functions");

const admin = require("firebase-admin");
const {
  getAllUserCodes,
  getBestUnique,
  findUserWithCode,
  getScoreFromQrId,
} = require("./utils");

const db = admin.firestore();

// see also: https://firebase.google.com/docs/functions/database-events#handle_event_data

const logger = functions.logger;
const USERS_COL = "users",
  QR_METADATA_COL = "qrCodesMetadata";

exports.onCreateQr = async (event, context) => {
  const { userId, qrId } = context.params;

  const newScore = event.data().score;

  const userRef = db.collection(USERS_COL).doc(userId);
  const qrGlobalRef = db.collection(QR_METADATA_COL).doc(qrId);

  await db.runTransaction(async (transaction) => {
    // kinda confusing transactions methods return promises, event.<something>.data() doesn't
    const userDoc = await transaction.get(userRef);
    const qrDoc = await transaction.get(qrGlobalRef);

    // assume the user exists
    const isNewHighScore =
      newScore > (userDoc.data()?.bestScoringQr?.score || 0);

    const newBestScoringQr = {
      score: isNewHighScore
        ? newScore
        : userDoc.data()?.bestScoringQr?.score || 0,
      qrId: isNewHighScore
        ? qrId
        : userDoc.data()?.bestScoringQr?.qrId || "CF ERROR",
    };

    const userUpdateInfo = {
      totalScore: admin.firestore.FieldValue.increment(newScore),
      totalScanned: admin.firestore.FieldValue.increment(1),
      bestScoringQr: newBestScoringQr,
    };
    const qrUpdateInfo = {
      numScanned: admin.firestore.FieldValue.increment(1),
    };

    logger.log(
      `Updating ${userId} with new QR ${qrId} new total: ${JSON.stringify(
        userUpdateInfo
      )}`
    );
    logger.log(
      `Updating ${qrId} with new numScanned : ${JSON.stringify(qrUpdateInfo)}`
    );

    // update → only works to update
    // set → works to update and create
    await Promise.all([
      transaction.update(userRef, userUpdateInfo),
      transaction.set(qrGlobalRef, qrUpdateInfo),
    ]);
  });
};
