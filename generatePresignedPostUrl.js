import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import * as dotenv from "dotenv";
dotenv.config();

const REGION = "us-east-1";
const BUCKET = "jaetill-game-nights";         // Update as needed
const OBJECT_KEY = "gameNights.json";         // Destination key in S3
const CONTENT_TYPE = "application/json";      // Type of upload
const EXPIRES_IN_SECONDS = 300;               // 5 minutes

const client = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

async function generate() {
  const { url, fields } = await createPresignedPost(client, {
    Bucket: BUCKET,
    Key: OBJECT_KEY,
    Fields: {
      "Content-Type": CONTENT_TYPE
    },
    Conditions: [
      ["starts-with", "$Content-Type", CONTENT_TYPE]
    ],
    Expires: EXPIRES_IN_SECONDS
  });

  console.log("✅ POST URL:\n", url);
  console.log("\n📦 Form Fields:\n");
  for (const [name, value] of Object.entries(fields)) {
    console.log(`${name}: ${value}`);
  }
}

generate().catch(console.error);
