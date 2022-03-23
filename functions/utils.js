const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();
const logger = functions.logger;

async function findUserWithCode(qrId, score, geoHash) {
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

  logger.log(
    `Finding user for qrID ${qrId} with conditions ${JSON.stringify([
      cond1,
      cond2,
    ])}`
  );
  let narrowedQrCodesResp = await db
    .collectionGroup("qrCodes")
    .where(...cond1)
    .where(...cond2)
    .get();

  logger.debug(
    `Found IDs matching score=${score} and location.geohash=${geoHash}: ${JSON.stringify(
      narrowedQrCodesResp.docs.map((g) => g.data())
    )}`
  );
  const foundDoc = narrowedQrCodesResp.docs.find(
    (elem) => elem.ref.id === qrId
  );
  return foundDoc ? foundDoc.ref.parent.id : null;
}

async function getAllUserCodes(userId) {
  let docsRef = await db
    .collection(`users/${userId}/qrCodes`)
    .orderBy("score", "desc")
    .get();
  return docsRef.docs;
}

async function getBestUniqueSnapshot(qrCodesSnapshot, excludedQrId) {
  // https://stackoverflow.com/a/66265824
  // firestore limits batches to 10
  qrCodesSnapshot = qrCodesSnapshot.filter(
    (code) => code.ref.id !== excludedQrId
  );

  while (qrCodesSnapshot.length) {
    const batch = qrCodesSnapshot.splice(0, 10);
    const batchIds = batch.map((x) => x.ref.id);
    logger.debug(
      `Checking batch of IDs for best unique: ${JSON.stringify(batchIds)}`
    );
    // add the batch request to to a queue
    const qrCodesMetadata = await db
      .collection(QR_METADATA_COL)
      .where(admin.firestore.FieldPath.documentId(), "in", [...batchIds])
      .where("numScanned", "==", 1)
      .get();
    logger.debug(`found ${qrCodesMetadata.size} results`);
    if (qrCodesMetadata.size > 1) {
      return getDataForQrId(
        qrCodesMetadata.docs
          .sort((a, b) => {
            return (
              getDataForQrId(a.ref.id, batch).data().score -
              getDataForQrId(b.ref.id, batch).data().score
            );
          })
          .reverse()[0],
        batch
      );
    }
  }
}

function getDataForQrId(qrId, qrCodes) {
  for (const qrCode of qrCodes) {
    if (qrCode.ref.id === qrId) {
      return qrCode.data();
    }
  }
}

exports = {
  getBestUniqueSnapshot: getBestUniqueSnapshot,
  getScoreFromQrId: getDataForQrId,
  getAllUserCodes,
  findUserWithCode,
};
