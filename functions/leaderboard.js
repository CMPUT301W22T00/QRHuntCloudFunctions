const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();
const logger = functions.logger;

module.exports.leaderboardRanker = async (ctx) => {
    const allUsers = (await db.collection("users").get()).docs;
    let allUsersRanksNew = {};
    allUsers.sort((a, b) => (b.data().totalScore ?? 0) - (a.data().totalScore ?? 0));
    for (const [idx, uDocs] of allUsers.entries()) {
        allUsersRanksNew[uDocs.ref.id] = {totalScore: idx};
    }
    allUsers.sort((a, b) => (b.data().bestUniqueQr?.score ?? 0) - (a.data().bestUniqueQr?.score ?? 0));
    for (const [idx, uDocs] of allUsers.entries()) {
        allUsersRanksNew[uDocs.ref.id].bestUniqueQr = idx;
    }
    allUsers.sort((a, b) => (b.data().totalScanned ?? 0) - (a.data().totalScanned ?? 0));
    for (const [idx, uDocs] of allUsers.entries()) {
        allUsersRanks[uDocs.ref.id].numScanned = idx;
    }
    for (const prop in allUsersRanksNew) {
        logger.log(`${prop}: ${JSON.stringify(allUsersRanksNew[prop])}`);
    }
    const batchedWrite = db.batch();
    for (const prop in allUsersRanksNew) {
        batchedWrite.update(db.collection("users").doc(prop), {"rank": allUsersRanksNew[prop]});
    }
    await batchedWrite.commit();
};
