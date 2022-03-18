const functions = require("firebase-functions");

const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// see also: https://firebase.google.com/docs/functions/database-events#handle_event_data

const QR_ENDPOINT = "users/{userId}/qrCodes/{qrId}",
  USERS_COL = "users",
  QR_METADATA_COL = "qrCodesMetadata";

exports.createQr = functions.firestore
  .document(QR_ENDPOINT)
  .onCreate(async (event, context) => {
    const {userId, qrId} = context.params;

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

      functions.logger.log(
        `Updating ${userId} with new QR ${qrId} new total: ${JSON.stringify(
          userUpdateInfo
        )}`
      );
      functions.logger.log(
        `Updating ${qrId} with new numScanned : ${JSON.stringify(qrUpdateInfo)}`
      );

      // update → only works to update
      // set → works to update and create
      await Promise.all([
        transaction.update(userRef, userUpdateInfo),
        transaction.set(qrGlobalRef, qrUpdateInfo),
      ]);
    });
  });

exports.deleteQR = functions.firestore
  .document(QR_ENDPOINT)
  .onDelete(async (event, context) => {
    const {userId, qrId} = context.params;

    const scoreDelta = -event.data().score;

    const userRef = db.collection(USERS_COL).doc(userId);
    const qrGlobalRef = db.collection(QR_METADATA_COL).doc(qrId);

    await db.runTransaction(async (transaction) => {
      // kinda confusing transactions methods return promises, event.<something>.data() doesn't
      const userDoc = await transaction.get(userRef);
      const qrDoc = await transaction.get(qrGlobalRef);


      let newBestScoringQr = null;
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
        }
      }
      if (newBestScoringQr === null) {
        newBestScoringQr = {
          score: userDoc.data()?.bestScoringQr?.score || 0,
          qrId: userDoc.data()?.bestScoringQr?.qrId,
        };
      }

      // qrDoc may not exist at this point
      const newMetadataNumScanned = (qrDoc.data()?.numScanned || 1) - 1;
      const newUserTotalScanned = (userDoc.data()?.totalScanned || 1) - 1;

      const userUpdateInfo = {
        totalScore: admin.firestore.FieldValue.increment(scoreDelta),
        totalScanned: admin.firestore.FieldValue.increment(-1),
        bestScoringQr: newBestScoringQr,
      };

      const qrCodesUpdateInfo = {
        numScanned: admin.firestore.FieldValue.increment(-1),
      };

      functions.logger.log(
        `Updating ${userId} with new QR ${qrId} new total: ${JSON.stringify(
          userUpdateInfo
        )}`
      );
      functions.logger.log(
        `Updating ${qrId} with new numScanned : ${JSON.stringify(
          qrCodesUpdateInfo
        )}`
      );

      // update → only works to update
      // set → works to update and create
      await Promise.all([
        transaction.update(userRef, userUpdateInfo),
        transaction.set(qrGlobalRef, qrCodesUpdateInfo),
      ]);
    });
  });
