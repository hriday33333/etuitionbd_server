const fs = require('fs');
const key = fs.readFileSync(
  './etuitionbd-7ef5f-firebase-adminsdk-fbsvc-b4a2ccf811.json',
  'utf8'
);
const base64 = Buffer.from(key).toString('base64');
console.log(base64);
