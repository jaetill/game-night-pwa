// ✅ Dependencies: Install with
// npm install @aws-sdk/client-s3 @aws-sdk/s3-presigned-post dotenv

const { S3Client } = require("@aws-sdk/client-s3");
const { createPresignedPost } = require("@aws-sdk/s3-presigned-post");
require("dotenv").config(); // optional—only if you're using a .env file

const REGION = "us-east-1";
const BUCKET_NAME = "jaetill-game-nights";
const KEY = "gameNights.json";

// 👇 This is the key change: regional endpoint (no redirect, full CORS support)
const client = new S3Client({
  region: REGION,
  endpoint: "https://s3.us-east-1.amazonaws.com", // ← region-based, avoids 301
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

async function generatePresignedPost() {
  const { url, fields } = await createPresignedPost(client, {
    Bucket: BUCKET_NAME,
    Key: KEY,
    Conditions: [
      ["starts-with", "$Content-Type", "application/json"]
    ],
    Fields: {
      "Content-Type": "application/json"
    },
    Expires: 300 // 5 minutes
  });

  // 🛠️ Manually fix the URL to point to regional endpoint format (if needed)
  const fixedUrl = `https://s3.us-east-1.amazonaws.com/${BUCKET_NAME}`;

  console.log("✅ Presigned POST URL:\n", fixedUrl);
  console.log("\n📦 Form fields:");
  for (const [k, v] of Object.entries(fields)) {
    console.log(`${k}: ${v}`);
  }
}

generatePresignedPost();
