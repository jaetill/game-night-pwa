const crypto = require("crypto");
require("dotenv").config(); // make sure you have AWS credentials in your .env

const BUCKET = "jaetill.game.nights";
const REGION = "us-east-1";
const KEY = "gameNights.json";
const EXPIRE_IN_MINUTES = 5;

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

// Build datetime values
const now = new Date();
const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "") + "Z";
const shortDate = amzDate.slice(0, 8);
const expiration = new Date(now.getTime() + EXPIRE_IN_MINUTES * 60000).toISOString();

const credential = `${accessKeyId}/${shortDate}/${REGION}/s3/aws4_request`;
const policy = {
  expiration,
  conditions: [
    { bucket: BUCKET },
    ["starts-with", "$key", KEY],
    { "Content-Type": "application/json" },
    { "x-amz-algorithm": "AWS4-HMAC-SHA256" },
    { "x-amz-credential": credential },
    { "x-amz-date": amzDate }
  ]
};

const policyBase64 = Buffer.from(JSON.stringify(policy)).toString("base64");

// Generate Signature V4
function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = crypto.createHmac("sha256", "AWS4" + key).update(dateStamp).digest();
  const kRegion = crypto.createHmac("sha256", kDate).update(regionName).digest();
  const kService = crypto.createHmac("sha256", kRegion).update(serviceName).digest();
  return crypto.createHmac("sha256", kService).update("aws4_request").digest();
}
const signingKey = getSignatureKey(secretAccessKey, shortDate, REGION, "s3");
const signature = crypto.createHmac("sha256", signingKey).update(policyBase64).digest("hex");

// Output
console.log("\nPOST to: https://s3." + REGION + ".amazonaws.com/" + BUCKET);
console.log("\nForm fields:");
console.log({
  key: KEY,
  "Content-Type": "application/json",
  "x-amz-algorithm": "AWS4-HMAC-SHA256",
  "x-amz-credential": credential,
  "x-amz-date": amzDate,
  policy: policyBase64,
  "x-amz-signature": signature
});
