const functions = require("firebase-functions");

const admin = require("firebase-admin");
const {
  getAllUserCodes,
  getBestUniqueSnapshot,
  findUserWithCode,
  getScoreFromQrId,
} = require("./utils");

const db = admin.firestore();

// see also: https://firebase.google.com/docs/functions/database-events#handle_event_data

const logger = functions.logger;
const USERS_COL = "users",
  QR_METADATA_COL = "qrCodesMetadata";

exports.onCreateQr = async (event, context) => {
  const { userId, qrId: incomingQrId } = context.params;

  const incomingScore = event.data().score;
  const incomingGeoHash = event.data().location?.geoHash;

  const userRef = db.collection(USERS_COL).doc(userId);
  const qrGlobalRef = db.collection(QR_METADATA_COL).doc(incomingQrId);

  await db.runTransaction(async (transaction) => {
    // kinda confusing transactions methods return promises, event.<something>.data() doesn't
    const userDoc = await transaction.get(userRef);
    const qrDoc = await transaction.get(qrGlobalRef);

    // assume the user exists
    const isNewHighScore =
      incomingScore > (userDoc.data()?.bestScoringQr?.score || 0);

    const numScanned = qrDoc.data()?.numScanned || 0;

    let newBestUniqueQr = userDoc.data()?.bestUniqueQr;
    logger.debug(`numScanned == ${numScanned} for ${incomingQrId}`);
    if (numScanned === 0) {
      // the qr code is unique, we only need to compare to the users current qr code
      if ((userDoc.data()?.bestUniqueQr?.score || 0) >= incomingScore) {
        newBestUniqueQr = {
          qrId: incomingQrId,
          score: incomingScore,
        };
      }
    } else if (numScanned === 1 && incomingQrId !== newBestUniqueQr.qrId) {
      // ↑ in theory, we never go to insert something that's already present
      // in practice, that code doesn't exist on the client right now.
      // there's someone else out there, that has scanned this QR code, but now, it won't be unique anymore
      const otherUser = await findUserWithCode(
        incomingQrId,
        incomingScore,
        incomingGeoHash
      );
      if (otherUser) {
        if (otherUser === userId) {
          logger.warn(
            `This should never happen. You should be ashamed of the code
             that brought you to this point. qrID=${incomingQrId} userId=${userId}`
          );
        } else {
          const allQrCodesSnapshot = await getAllUserCodes(otherUser);
          logger.debug(`checking batch of IDs for best unique`);
          const bestNewUnique = getBestUniqueSnapshot(allQrCodesSnapshot, otherUser);
          if (bestNewUnique) {
            logger.debug(`found new bestNewUnique: ${JSON.stringify(bestNewUnique.data())}`);
            newBestUniqueQr = {
              qrId: bestNewUnique.ref.id,
              score: bestNewUnique
            }
          } else {
            logger.warn("failed to find new best unique QR");
          }
        }
      }
      logger.warn(`couldn't find the other user with this QR code qrId=${incomingQrId}`);
    } else {
      logger.debug("no need to update best scoring unique, as this code is not unique");
    }

    const newBestScoringQr = {
      score: isNewHighScore
        ? incomingScore
        : userDoc.data()?.bestScoringQr?.score || 0,
      qrId: isNewHighScore
        ? incomingQrId
        : userDoc.data()?.bestScoringQr?.qrId || "CF ERROR",
    };

    const userUpdateInfo = {
      totalScore: admin.firestore.FieldValue.increment(incomingScore),
      totalScanned: admin.firestore.FieldValue.increment(1),
      bestScoringQr: newBestScoringQr,
      bestUniqueQr: newBestUniqueQr
    };
    const qrUpdateInfo = {
      numScanned: admin.firestore.FieldValue.increment(1),
    };

    logger.log(
      `Updating ${userId} with new QR ${incomingQrId} new total: ${JSON.stringify(
        userUpdateInfo
      )}`
    );
    logger.log(
      `Updating ${incomingQrId} with new numScanned : ${JSON.stringify(
        qrUpdateInfo
      )}`
    );

    // update → only works to update
    // set → works to update and create
    await Promise.all([
      transaction.update(userRef, userUpdateInfo),
      transaction.set(qrGlobalRef, qrUpdateInfo),
    ]);
  });
};
