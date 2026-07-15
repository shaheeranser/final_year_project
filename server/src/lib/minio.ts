import { Client } from 'minio';
import dotenv from 'dotenv';

dotenv.config();

const endPoint = process.env.MINIO_ENDPOINT || 'localhost';
const port = parseInt(process.env.MINIO_PORT || '9000', 10);
const useSSL = process.env.MINIO_USE_SSL === 'true';
const accessKey = process.env.MINIO_ACCESS_KEY || 'minioadmin';
const secretKey = process.env.MINIO_SECRET_KEY || 'minioadmin';
const bucketName = process.env.MINIO_BUCKET || 'exam-proctoring';

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
