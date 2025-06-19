const { S3Client } = require("@aws-sdk/client-s3");
const { createPresignedPost } = require("@aws-sdk/s3-presigned-post");
require("dotenv").config();

const BUCKET = "jaetill-game-nights"; // update if renamed
const REGION = "us-east-1";
const KEY = "gameNights.json";

const client = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

async function go() {
  const { url, fields } = await createPresignedPost(client, {
    Bucket: BUCKET,
    Key: KEY,
    Conditions: [["starts-with", "$Content-Type", "application/json"]],
    Fields: {
      "Content-Type": "application/json"
    },
    Expires: 300
  });

  console.log("✅ URL:", url);
  console.log("📦 Fields:");
  for (const [k, v] of Object.entries(fields)) {
    console.log(`${k}: ${v}`);
  }
}

go();
