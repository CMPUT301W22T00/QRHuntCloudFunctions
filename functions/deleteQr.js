const functions = require("firebase-functions");

const admin = require("firebase-admin");
const {
  getAllUserCodes,
  getBestUniqueSnapshot,
  findUserWithCode,
  getDataForQrId,
} = require("./utils");

const db = admin.firestore();

// see also: https://firebase.google.com/docs/functions/database-events#handle_event_data

const logger = functions.logger;
const USERS_COL = "users",
  QR_METADATA_COL = "qrCodesMetadata";

exports.onDeleteQr = async (event, context) => {
  const { userId, qrId } = context.params;

  const scoreDelta = -event.data().score;

  const userRef = db.collection(USERS_COL).doc(userId);
  const qrGlobalRef = db.collection(QR_METADATA_COL).doc(qrId);

  await db.runTransaction(async (transaction) => {
    // kinda confusing transactions methods return promises, event.<something>.data() doesn't
    const userDoc = await transaction.get(userRef);
    const qrDoc = await transaction.get(qrGlobalRef);

    let newBestScoringQr = userDoc.data()?.bestScoringQr || null;
    if (userDoc.data()?.bestScoringQr?.qrId === qrId) {
      let snapshot = await transaction.get(
        db
          .collection(USERS_COL)
          .doc(userId)
          .collection("qrCodes")
          .orderBy("score", "desc")
          .limit(1)
      );
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        newBestScoringQr = {
          score: doc.data()?.score || 0,
          qrId: doc.id,
        };
      } else {
        // no more qr codes, there is no best one
        newBestScoringQr = null;
      }
    }

    // qrDoc may not exist at this point
    const newMetadataNumScanned = (qrDoc.data()?.numScanned || 1) - 1;
    const newUserTotalScanned = (userDoc.data()?.totalScanned || 1) - 1;

    const userUpdateInfo = {
      totalScore: admin.firestore.FieldValue.increment(scoreDelta),
      totalScanned: admin.firestore.FieldValue.increment(-1),
      bestScoringQr: newBestScoringQr || null,
    };

    const qrCodesUpdateInfo = {
      numScanned: admin.firestore.FieldValue.increment(-1),
    };

    logger.log(
      `Updating ${userId} with new QR ${qrId} new total: ${JSON.stringify(
        userUpdateInfo
      )}`
    );
    logger.log(
      `Updating ${qrId} with new numScanned : ${JSON.stringify(
        qrCodesUpdateInfo
      )}`
    );

    // update → only works to update
    // set → works to update and create
    return await Promise.all([
      transaction.update(userRef, userUpdateInfo),
      transaction.set(qrGlobalRef, qrCodesUpdateInfo, { merge: true }),
    ]);
  });
};
