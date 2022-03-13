const functions = require('firebase-functions');

// The Firebase Admin SDK to access Firestore.
const admin = require('firebase-admin');

admin.initializeApp();

// see also: https://firebase.google.com/docs/functions/database-events#handle_event_data

exports.updateCounters = functions.firestore.document('users/{userId}/qrCodes/{qrId}')
  .onWrite(async (event, context) => {
    const {userId, qrId} = context.params;
    const db = admin.firestore();

    const oldScore = event.before.exists ? event.before.data().score : 0; // if it's an insert, no previous value
    functions.logger.log(`Updating ${userId} with new QR ${qrId} old score: ${oldScore}`);
    const newScore = event.after.exists ? event.after.data().score : 0; // if it's a delete, no previous value
    functions.logger.log(`Updating ${userId} with new QR ${qrId} new score: ${newScore}`);
    const scoreDelta = newScore - oldScore;
    functions.logger.log(`Updating ${userId} with new QR ${qrId} new score∂: ${scoreDelta}`);

    let numScannedDelta;
    if (!event.after.exists) {
      // deletion
      numScannedDelta = -1;
    } else if (!event.before.exists) {
      // add
      numScannedDelta = 1;
    } else {
      // update
      numScannedDelta = 0;
    }
    functions.logger.log(`numScanned ∂: ${numScannedDelta}`);


    const userRef = db.collection("users").doc(userId);
    const qrGlobalRef = db.collection("qrCodes").doc(qrId);

    functions.logger.log(`fetching doc references for user and qr`);


    await db.runTransaction(async (transaction) => {
      const userDoc = transaction.get(userRef);
      const qrDoc = transaction.get(qrGlobalRef);

      // assume the user exists
      const newTotalScore = userDoc.data().totalScore + scoreDelta;
      functions.logger.log(`new total score: ${newTotalScore}`);

      const isNewHighScore = newScore > userDoc.data().best.score;

      const newBest = {
        score: isNewHighScore ? newScore : userDoc.data().best.score,
        qrId: isNewHighScore ? qrId : userDoc.data().best.qrId
      }

      // qrDoc may not exist at this point
      // yes, on a deletion where qrGlobalRef doesn't exist, we will be setting numScanned to one
      // this would be an inconsistent state to be in to be so I don't feel like covering this edge case here
      const newNumScanned = qrDoc.exists ? qrDoc.data().numScanned + numScannedDelta : 1;

      functions.logger.log(`Updating ${userId} with new QR ${qrId} new total: ${{
        score: newTotalScore,
        best: newBest
      }}`);
      functions.logger.log(`Updating ${qrId} with new numScanned : ${{
        numScanned: newNumScanned
      }}`);

      // update → only works to update
      // set → works to update and create
      transaction.update(userRef, {
        score: newTotalScore,
        best: newBest
      });
      transaction.set(qrGlobalRef, {
        numScanned: newNumScanned
      });
    })
  });

