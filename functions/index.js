const functions = require("firebase-functions");

const admin = require("firebase-admin");
const { documentId } = require("firebase/firestore/lite");

admin.initializeApp();
const db = admin.firestore();

// see also: https://firebase.google.com/docs/functions/database-events#handle_event_data

const QR_ENDPOINT = "users/{userId}/qrCodes/{qrId}",
  USERS_COL = "users",
  QR_METADATA_COL = "qrCodesMetadata";

exports.createQr = functions.firestore
  .document(QR_ENDPOINT)
  .onCreate(async (event, context) => {
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
    const { userId, qrId } = context.params;

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

function findUserWithCode(qrId, score, geoHash) {
  // We can't just query by document (qr) ID, that would be too simple
  // https://stackoverflow.com/a/58104104/3427299
  // instead, we use score and geoHash as a way to narrow down what are options may be,
  // then iterate over them and find out what the one that matches
  // maybe a better way to do this would be to store the document I'd in the document - gross either way
  let cond1;
  const cond2 = ["score", "==", score];
  if (!geoHash) {
    // we can't just look for geohash == null, that query doesn't return results
    cond1 = ["location", "==", null];
  } else {
    cond1 = ["location.geoHash", "==", geoHash];
  }

  functions.logger.log(`Finding user for qrID ${qrId} `);
  return db
    .collectionGroup("qrCodes")
    .where(...cond1)
    .where(...cond2)
    .get()
    .then((val) => {
      if (val.empty) {
        for (const doc of val.docs) {
          if (doc.ref.id === qrId) {
            coacheId = doc.ref.path.split("/")[1];
            const coacheId1 = coacheId;
            return coacheId1;
          }
        }
      }
      return null;
    });
}

async function getAllUserCodes(userId) {
  let docsRef = await db
    .collection(`users/${userId}/qrCodes`)
    .orderBy("score", "desc")
    .get();
  return docsRef.docs;
}

async function getBestUnique(userId, codes, excludedQrId) {
  if (!codes || !codes.length) return [];
  const batches = [];
  // https://stackoverflow.com/a/66265824
  while (codes.length) {
    // firestore limits batches to 10
    const batch = codes.splice(0, 10);
    // add the batch request to to a queue
    await codes = db
        .collection(QR_METADATA_COL)
        .where(documentId(), "in", [...batch])
        .get();
    if (codes.length === 1) {
      codes;
    }
  }
  return Promise.all(batches).then((content) => content.flat());
}
