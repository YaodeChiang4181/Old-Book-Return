import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";

const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function uploadImageToR2(file: Buffer, mimeType: string, extension: string) {
  const fileName = `${uuidv4()}.${extension}`;
  const bucketName = process.env.R2_BUCKET_NAME!;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: fileName,
    Body: file,
    ContentType: mimeType,
  });

  await s3Client.send(command);

  // If a public URL is configured, use it. Otherwise, fallback to the raw R2 endpoint URL (might require bucket to be public)
  // For Cloudflare R2, usually it's best to configure a custom domain or r2.dev subdomain for public access.
  const baseUrl = process.env.R2_PUBLIC_URL || `${process.env.R2_ENDPOINT}/${bucketName}`;
  return `${baseUrl}/${fileName}`;
}
