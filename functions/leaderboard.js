const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();

module.exports.leaderboardRanker = async (ctx) => {
    const allUsers = [];
    for (const userDoc of (await db.collection("users").get()).docs) {
        allUsers.push(userDoc);
    }
    const allUsersRanks = {};
    allUsers.sort((a,b) => {
        return (a.totalScore ?? 0) - (b.totalScore ?? 0);
    });
    for (const [idx, uDocs] of allUsers.entries()) {
        allUsersRanks[uDocs.ref.id] = {"total": idx};
    }
    allUsers.sort((a,b) => {
        return (a.bestUniqueQr?.score ?? 0) - (b.bestUniqueQr?.score ?? 0);
    });
    for (const [idx, uDocs] of allUsers.entries()) {
        allUsersRanks[uDocs.ref.id].unique = idx;
    }
    allUsers.sort((a,b) => {
        return (a.numScanned ?? 0) - (b.numScanned ?? 0);
    });
    for (const [idx, uDocs] of allUsers.entries()) {
        allUsersRanks[uDocs.ref.id].numScanned = idx;
    }

}
