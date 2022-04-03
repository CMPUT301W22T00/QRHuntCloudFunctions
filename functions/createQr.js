const functions = require("firebase-functions");

const admin = require("firebase-admin");
const { findUserRefWithCode, getBestUniqueForUser } = require("./utils");

const db = admin.firestore();

// see also: https://firebase.google.com/docs/functions/database-events#handle_event_data

const logger = functions.logger;
const USERS_COL = "users",
    QR_METADATA_COL = "qrCodesMetadata";

exports.onCreateQr = async (event, context) => {
    const { userId, qrId: incomingQrId } = context.params;
    let txOps = [];

    const incomingScore = event.data().score;
    const incomingGeoHash = event.data().location?.geoHash;

    const userRef = db.collection(USERS_COL).doc(userId);
    const qrGlobalRef = db.collection(QR_METADATA_COL).doc(incomingQrId);

    await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        const qrDoc = await transaction.get(qrGlobalRef);

        const isNewHighScore = incomingScore > (userDoc.data()?.bestScoringQr?.score || 0);

        const numScanned = qrDoc.data()?.numScanned || 0;

        let curBestUniqueQr = userDoc.data()?.bestUniqueQr;
        logger.debug(`numScanned == ${numScanned} for ${incomingQrId}`);
        if (numScanned === 0) {
            // the qr code is unique, we only need to compare to the users current qr code
            if (incomingScore > (curBestUniqueQr?.score || 0)) {
                curBestUniqueQr = {
                    qrId: incomingQrId,
                    score: incomingScore,
                };
            }
        } else if (numScanned === 1 && incomingQrId !== curBestUniqueQr?.qrId) {
            // ↑ in theory, we never go to insert something that's already present
            // in practice, that code doesn't exist on the client right now.
            // there's someone else out there, that has scanned this QR code, but now, it won't be unique anymore
            const otherUserRef = await findUserRefWithCode(incomingQrId, incomingScore, incomingGeoHash, userId);
            if (otherUserRef) {
                logger.info(
                    `other user ${otherUserRef.id} has been affected by ${userId} insertion of ${incomingQrId}`
                );
                const newBestUniqueQr = await getBestUniqueForUser(otherUserRef.id);
                logger.info(`other user ${otherUserRef.id} new best unique QR: ${JSON.stringify(newBestUniqueQr)}`);
                txOps.push(transaction.update(otherUserRef, {"bestUniqueQr": newBestUniqueQr}));
            } else {
                logger.warn(`couldn't find the user with this QR code qrId=${incomingQrId} userId=${userId}`);
            }
        } else {
            logger.debug("no need to update best scoring unique, as this code is not unique");
        }

        const newBestScoringQr = {
            score: isNewHighScore ? incomingScore : userDoc.data()?.bestScoringQr?.score || 0,
            qrId: isNewHighScore ? incomingQrId : userDoc.data()?.bestScoringQr?.qrId || "CF ERROR",
        };

        const userUpdateInfo = {
            totalScore: admin.firestore.FieldValue.increment(incomingScore),
            totalScanned: admin.firestore.FieldValue.increment(1),
            bestScoringQr: newBestScoringQr || null,
            bestUniqueQr: curBestUniqueQr || null,
        };
        const qrUpdateInfo = {
            numScanned: admin.firestore.FieldValue.increment(1),
        };

        logger.log(`Updating ${userId} with new QR ${incomingQrId} new total: ${JSON.stringify(userUpdateInfo)}`);
        logger.log(`Updating ${incomingQrId} with new numScanned : ${JSON.stringify(qrUpdateInfo)}`);

        // update → only works to update
        // set → works to update and create
        txOps.push(
            transaction.update(userRef, userUpdateInfo),
            transaction.set(qrGlobalRef, qrUpdateInfo, { merge: true })
        );
        await Promise.all(txOps);
    });
};
