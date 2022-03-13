const functions = require('firebase-functions');

// The Firebase Admin SDK to access Firestore.
const admin = require('firebase-admin');

admin.initializeApp();

// see also: https://firebase.google.com/docs/functions/database-events#handle_event_data


const QR_ENDPOINT = 'users/{userId}/qrCodes/{qrId}';

exports.updateQr = functions.firestore.document(QR_ENDPOINT)
  .onUpdate(async (event, context) => {
    const {userId, qrId} = context.params;
    const db = admin.firestore();

    const oldScore = event.before.data().score;
    const newScore = event.after.data().score;
    const scoreDelta = newScore - oldScore;

    const userRef = db.collection("users").doc(userId);
    const qrGlobalRef = db.collection("qrCodes").doc(qrId);

    await db.runTransaction(async (transaction) => {
      // kinda confusing transactions methods return promises, event.<something>.data() doesn't
      const userDoc = await transaction.get(userRef);
      const qrDoc = await transaction.get(qrGlobalRef);

      // assume the user exists
      const newTotalScore = userDoc.data().totalScore + scoreDelta;
      const isNewHighScore = newScore > userDoc.data().best.score;

      const newBest = {
        score: isNewHighScore ? newScore : await userDoc.data().best.score,
        qrId: isNewHighScore ? qrId : await userDoc.data().best.qrId
      }

      // qrDoc may not exist at this point
      const newNumScanned = qrDoc.data().numScanned + 1;

      functions.logger.log(`Updating ${userId} with new QR ${qrId} new total: ${JSON.stringify({
        score: newTotalScore,
        best: newBest
      })}`);
      functions.logger.log(`Updating ${qrId} with new numScanned : ${JSON.stringify({
        numScanned: newNumScanned
      })}`);

      // update → only works to update
      // set → works to update and create
      await Promise.all(
        [transaction.update(userRef, {
          totalScore: newTotalScore,
          best: newBest
        }),
          transaction.update(qrGlobalRef, {
            numScanned: newNumScanned
          })]
      )
    });
  });

exports.deleteQR = functions.firestore.document(QR_ENDPOINT)
  .onDelete(async (event, context) => {
    const {userId, qrId} = context.params;
    const db = admin.firestore();

    const scoreDelta = -event.before.data().score;

    const userRef = db.collection("users").doc(userId);
    const qrGlobalRef = db.collection("qrCodes").doc(qrId);

    await db.runTransaction(async (transaction) => {
      // kinda confusing transactions methods return promises, event.<something>.data() doesn't
      const userDoc = await transaction.get(userRef);
      const qrDoc = await transaction.get(qrGlobalRef);

      // assume the user exists
      const newTotalScore = userDoc.data().totalScore + scoreDelta;

      let newBest = null;
      if (userDoc.data().best.qrId === qrId) {
        snapshot = await db.collection("users")
          .doc(userId)
          .collection("qrCodes")
          .orderBy("score", "desc")
          .get()
        if (snapshot.empty) {
          const doc = snapshot.docs[0]
          newBest = {
            score: doc.data().score || 0,
            qrId: doc.id,
          }
        }
      } else {
        newBest = {
          score: userDoc.data().best.score,
          qrId: userDoc.data().best.qrId,
        }
      }

      // qrDoc may not exist at this point
      const newNumScanned = qrDoc.data().numScanned - 1;

      functions.logger.log(`Updating ${userId} with new QR ${qrId} new total: ${JSON.stringify({
        score: newTotalScore,
        best: newBest
      })}`);
      functions.logger.log(`Updating ${qrId} with new numScanned : ${JSON.stringify({
        numScanned: newNumScanned
      })}`);

      // update → only works to update
      // set → works to update and create
      await Promise.all(
        [transaction.update(userRef, {
          totalScore: newTotalScore,
          best: newBest
        }),
          transaction.update(qrGlobalRef, {
            numScanned: newNumScanned
          })]
      )
    });
  });

exports.createQr = functions.firestore.document(QR_ENDPOINT)
  .onCreate(async (event, context) => {
    const {userId, qrId} = context.params;
    const db = admin.firestore();

    const newScore = event.after.data().score;
    const scoreDelta = newScore;

    const userRef = db.collection("users").doc(userId);
    const qrGlobalRef = db.collection("qrCodes").doc(qrId);

    await db.runTransaction(async (transaction) => {
      // kinda confusing transactions methods return promises, event.<something>.data() doesn't
      const userDoc = await transaction.get(userRef);
      const qrDoc = await transaction.get(qrGlobalRef);

      // assume the user exists
      const newTotalScore = userDoc.data().totalScore + scoreDelta;
      const isNewHighScore = newScore > userDoc.data().best.score;

      const newBest = {
        score: isNewHighScore ? newScore : await userDoc.data().best.score,
        qrId: isNewHighScore ? qrId : await userDoc.data().best.qrId
      }

      // qrDoc may not exist at this point
      const newNumScanned = (qrDoc.data().numScanned || 0) + 1;

      functions.logger.log(`Updating ${userId} with new QR ${qrId} new total: ${JSON.stringify({
        score: newTotalScore,
        best: newBest
      })}`);
      functions.logger.log(`Updating ${qrId} with new numScanned : ${JSON.stringify({
        numScanned: newNumScanned
      })}`);

      // update → only works to update
      // set → works to update and create
      await Promise.all(
        [transaction.update(userRef, {
          totalScore: newTotalScore,
          best: newBest
        }),
          transaction.update(qrGlobalRef, {
            numScanned: newNumScanned
          })]
      )
    });
  });
