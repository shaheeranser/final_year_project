import { Client } from 'minio';
import dotenv from 'dotenv';

dotenv.config();

// Parse the internal endpoint URL (e.g. "http://minio:9000") to extract
// the hostname and port for the MinIO client. Falls back to localhost:9000
// if the URL is missing or unparseable.
const internalEndpoint = process.env.MINIO_INTERNAL_ENDPOINT || 'http://localhost:9000';
const externalEndpoint = process.env.MINIO_EXTERNAL_ENDPOINT || 'http://localhost:9000';

let intEndPoint = 'localhost', intPort = 9000, intUseSSL = false;
try {
  const url = new URL(internalEndpoint);
  intEndPoint = url.hostname;
  intPort = parseInt(url.port, 10) || (url.protocol === 'https:' ? 443 : 9000);
  intUseSSL = url.protocol === 'https:';
} catch (e) {}

let extEndPoint = 'localhost', extPort = 9000, extUseSSL = false;
try {
  const url = new URL(externalEndpoint);
  extEndPoint = url.hostname;
  extPort = parseInt(url.port, 10) || (url.protocol === 'https:' ? 443 : 9000);
  extUseSSL = url.protocol === 'https:';
} catch (e) {}

const accessKey = process.env.MINIO_ROOT_USER || process.env.MINIO_ACCESS_KEY || 'minioadmin';
const secretKey = process.env.MINIO_ROOT_PASSWORD || process.env.MINIO_SECRET_KEY || 'minioadmin';
const bucketName = process.env.MINIO_BUCKET_NAME || process.env.MINIO_BUCKET || 'exam-proctoring';

export const minioClient = new Client({
  endPoint: intEndPoint,
  port: intPort,
  useSSL: intUseSSL,
  accessKey,
  secretKey
});

// A separate client configured with the external endpoint.
// AWS Signature V4 includes the Host header. If we generate the signature using the internal
// minio:9000 endpoint, the signature will be invalid when the browser accesses it via localhost:9000.
// Generating presigned URLs is a purely local crypto operation, so this client doesn't need network access.
export const minioExternalClient = new Client({
  endPoint: extEndPoint,
  port: extPort,
  useSSL: extUseSSL,
  accessKey,
  secretKey
});

export const getPresignedUrl = async (key: string, expirySeconds?: number): Promise<string | null> => {
  const expiry = Math.max(expirySeconds ?? parseInt(process.env.MINIO_PRESIGN_EXPIRY_S || '3600', 10), 60);
  try {
    // Generate the URL directly using the external client to ensure matching AWS signatures
    return await minioExternalClient.presignedGetObject(bucketName, key, expiry);
  } catch (error) {
    console.error('MinIO getPresignedUrl error:', error);
    return null;
  }
};

export const uploadSnapshot = async (key: string, buffer: Buffer, contentType: string): Promise<string | null> => {
  try {
    const bucketExists = await minioClient.bucketExists(bucketName);
    if (!bucketExists) {
      await minioClient.makeBucket(bucketName, 'us-east-1');
    }
    
    await minioClient.putObject(bucketName, key, buffer, buffer.length, {
      'Content-Type': contentType
    });
    return key;
  } catch (error) {
    console.error('MinIO uploadSnapshot error:', error);
    return null;
  }
};
