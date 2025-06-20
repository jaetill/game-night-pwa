import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const REGION = "us-east-2";
const BUCKET = "jaetill-game-nights";
const OBJECT_KEY = "gameNights.json";

const client = new S3Client({ region: REGION });

export const handler = async () => {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: OBJECT_KEY });
  const url = await getSignedUrl(client, command, { expiresIn: 60 }); // 60 seconds

  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "https://jaetill.github.io"
    },
    body: JSON.stringify({ url })
  };
};
