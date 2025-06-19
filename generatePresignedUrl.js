// 🔧 Required AWS SDK modules
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// 🌎 Config
const REGION = "us-east-1";
const BUCKET_NAME = "jaetill-game-nights";
const KEY = "gameNights.json";

// 🔑 Credentials from environment (make sure they're set)
const client = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

client.middlewareStack.remove("awsChunkedEncodingMiddleware");

async function generatePresignedUrl() {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: KEY,
    ContentType: "application/json",
    ChecksumAlgorithm: undefined // ✨ Critical: disables implicit x-amz-sdk-checksum-algorithm
  });

  const url = await getSignedUrl(client, command, { expiresIn: 300 }); // 5-minute URL
  console.log("✅ Presigned URL:\n", url);
}

generatePresignedUrl();
