This repo contains the cloud functions that run on our Firestore instance to keep running totals of things like score and top QR code in one's account. To get started locally, run `npm i` in `./functions`. See https://firebase.google.com/docs/functions/get-started for more details. Initial setup steps have already been taken.

 - Firebase docs & examples: https://firebase.google.com/docs/functions/firestore-events
 - To deploy: `firebase deploy --only functions`
 - To view production logs: https://console.firebase.google.com/u/0/project/sandbox-266120/functions/logs?search=&severity=DEBUG

When in doubt, use docs often, and view the API reference online if you have to. They seem to be fairly thorough.

