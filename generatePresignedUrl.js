const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const REGION = "us-east-1"; // Change if your bucket is in another region
const BUCKET_NAME = "jaetill-game-nights";
const KEY = "gameNights.json";

const client = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

async function generatePresignedUrl() {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: KEY,
    ContentType: "application/json"
  });

  const url = await getSignedUrl(client, command, { expiresIn: 300 }); // valid for 5 min
  console.log("Upload URL:\n", url);
}

generatePresignedUrl();
