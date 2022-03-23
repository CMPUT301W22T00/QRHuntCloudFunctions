This repo contains the cloud functions that run on our Firestore instance to keep running totals of things like score and top QR code in one's account. To get started locally, run `npm i` in `./functions`. See https://firebase.google.com/docs/functions/get-started for more details. Initial setup steps have already been taken.

 - Firebase docs & examples: https://firebase.google.com/docs/functions/firestore-events
 - To deploy: `firebase deploy --only functions`
 - To view production logs: https://console.firebase.google.com/u/0/project/sandbox-266120/functions/logs?search=&severity=DEBUG

When in doubt, use docs often, and view the API reference online if you have to. They seem to be fairly thorough.


### Design overview

The cloud functions defined in this repo serve the purpose of aggregate functions missing from firebase. They aim to reduce r/w when possible, but still do multiply client side writes by a significant amount.  The strategy for maintaining user's highest scoring QR, user total score, and users total scanned is self-explanatory.

The strategy for maintaining any one users _best unique_ QR code revolves around the usage of numScanned in the qrCodesMetadata collection to determine if a qrCode is unique. The chart below provides an overview of the logic.

```mermaid
flowchart TB
    id1(/user/userId/qrCodes/qrId) --> create(create qrId)
    id1 --> delete(delete qrId)
    create --> id2(numScanned = 0)
    id2 --> t(compare qrId to bestUnique and update if neceesary)
    create --> id3(numScanned = 1)
    id3 --> id4(get the one other user with with this code - findUserWithCode)
    id4 --> id5(get max score from numScanned for all qrCodes\n under the user found\nwhere numScanned == 1 - getBestUnique)
    id5 --> t
    create --> id7(numScanned > 1)
    id7 --> _(done)
    
    delete --> id8(is this qrId the same as bestUnique?)
    id8 --> y8(yes)
    y8 --> id5
    id8 --> no
    no --> n8_2(numScanned = 2)
    n8_2 --> n8_21(this qrCode is about to become unique)
    n8_21 --> id4
    t --> _
    
    no --> n8_gt2(numScanned > 2)
    n8_gt2 --> _
```

### Ranking/Leaderboard strategy

Since setting a new rank for a new player would require writing to every single player, this is done on a schedule 
rather than every insertion.
