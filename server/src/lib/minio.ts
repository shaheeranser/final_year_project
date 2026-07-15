import { Client } from 'minio';
import dotenv from 'dotenv';

dotenv.config();

// Parse the internal endpoint URL (e.g. "http://minio:9000") to extract
// the hostname and port for the MinIO client. Falls back to localhost:9000
// if the URL is missing or unparseable.
const internalEndpoint = process.env.MINIO_INTERNAL_ENDPOINT || 'http://localhost:9000';
let endPoint = 'localhost';
let port = 9000;
let useSSL = false;

try {
  const url = new URL(internalEndpoint);
  endPoint = url.hostname;
  port = parseInt(url.port, 10) || (url.protocol === 'https:' ? 443 : 9000);
  useSSL = url.protocol === 'https:';
} catch {
  console.warn('Failed to parse MINIO_INTERNAL_ENDPOINT, using defaults');
}

const accessKey = process.env.MINIO_ROOT_USER || process.env.MINIO_ACCESS_KEY || 'minioadmin';
const secretKey = process.env.MINIO_ROOT_PASSWORD || process.env.MINIO_SECRET_KEY || 'minioadmin';
const bucketName = process.env.MINIO_BUCKET_NAME || process.env.MINIO_BUCKET || 'exam-proctoring';

export const minioClient = new Client({
  endPoint,
  port,
  useSSL,
  accessKey,
  secretKey
});

export const getPresignedUrl = async (key: string, expirySeconds?: number): Promise<string | null> => {
  const expiry = Math.max(expirySeconds ?? parseInt(process.env.MINIO_PRESIGN_EXPIRY_S || '3600', 10), 60);
  try {
    return await minioClient.presignedGetObject(bucketName, key, expiry);
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
