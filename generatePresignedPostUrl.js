const { S3Client } = require("@aws-sdk/client-s3");
const { createPresignedPost } = require("@aws-sdk/s3-presigned-post");
require("dotenv").config(); // Optional if you're using .env

const REGION = "us-east-1";
const BUCKET_NAME = "jaetill-game-nights";
const KEY = "gameNights.json";

const client = new S3Client({
  region: REGION,
  endpoint: "https://s3.us-east-1.amazonaws.com",
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

  console.log("URL:", url);
  console.log("Fields:", fields);
}

generatePresignedPost();
