const functions = require("firebase-functions");

const admin = require("firebase-admin");
const { findUserRefWithCode, getBestUniqueForUser } = require("./utils");

const db = admin.firestore();

// see also: https://firebase.google.com/docs/functions/database-events#handle_event_data

const logger = functions.logger;
const USERS_COL = "users",
    QR_METADATA_COL = "qrCodesMetadata";

exports.onDeleteQr = async (event, context) => {
    const { userId, qrId: outgoingQrId } = context.params;
    const txOps = [];
    const outgoingScore = event.data().score;
    const outgoingGeoHash = event.data().location?.geoHash;

    const userRef = db.collection(USERS_COL).doc(userId);
    const qrGlobalRef = db.collection(QR_METADATA_COL).doc(outgoingQrId);

    await db.runTransaction(async (transaction) => {
        // kinda confusing transactions methods return promises, event.<something>.data() doesn't
        const userDoc = await transaction.get(userRef);
        let curBestUniqueQr = userDoc.data()?.bestUniqueQr;

        if (curBestUniqueQr?.qrId === outgoingQrId) {
            logger.debug(`cur best is what we are deleting (${outgoingQrId}), updating best unique`);
            const newBestUniqueQr = await getBestUniqueForUser(userId);
            curBestUniqueQr = newBestUniqueQr || curBestUniqueQr;
        } else if (((await transaction.get(qrGlobalRef)).data()?.numScanned || 0) === 2) {
            // there's someone else out there that has scanned this QR code
            // and after this deletion it will become unique to them
            const otherUserRef = await findUserRefWithCode(outgoingQrId, outgoingScore, outgoingGeoHash, userId);
            if (otherUserRef) {
                logger.info(
                    `other user ${otherUserRef.id} has been affected by ${userId} deletion of ${outgoingQrId}`
                );
                const newBestUniqueQr = await getBestUniqueForUser(otherUserRef.id);
                logger.info(`other user ${otherUserRef.id} new best unique QR: ${JSON.stringify(newBestUniqueQr)}`);
                txOps.push(transaction.update(otherUserRef, newBestUniqueQr));
            }
            logger.warn(`couldn't find the other user with this QR code qrId=${outgoingQrId}`);
        } else {
            logger.debug(
                "no need to update best scoring unique, as this code was not unique " +
                    "or will not cause any QRs to be unique, " +
                    "or wasn't the users best unique QR code"
            );
        }

        let newBestScoringQr = userDoc.data()?.bestScoringQr || null;
        if (userDoc.data()?.bestScoringQr?.qrId === outgoingQrId) {
            let snapshot = await transaction.get(
                db.collection(USERS_COL).doc(userId).collection("qrCodes").orderBy("score", "desc").limit(1)
            );
            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                newBestScoringQr = {
                    score: doc.data()?.score || 0,
                    qrId: doc.id,
                };
            } else {
                // user has no more qr codes, there is no best one
                newBestScoringQr = null;
            }
        }

        const userUpdateInfo = {
            totalScore: admin.firestore.FieldValue.increment(-outgoingScore),
            totalScanned: admin.firestore.FieldValue.increment(-1),
            bestScoringQr: newBestScoringQr || null,
            bestUniqueQr: curBestUniqueQr || null,
        };

        const qrCodesUpdateInfo = {
            numScanned: admin.firestore.FieldValue.increment(-1),
        };

        logger.log(`Updating ${userId} with deleted QR ${outgoingQrId} new total: ${JSON.stringify(userUpdateInfo)}`);
        logger.log(`Updating ${outgoingQrId} with new numScanned : ${JSON.stringify(qrCodesUpdateInfo)}`);

        // update → only works to update
        // set → works to update and create
        txOps.push(
            transaction.update(userRef, userUpdateInfo),
            transaction.set(qrGlobalRef, qrCodesUpdateInfo, { merge: true })
        );
        return await Promise.all(txOps);
    });
};
