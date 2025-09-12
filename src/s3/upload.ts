import { Upload } from '@aws-sdk/lib-storage'
import { S3Client } from '@aws-sdk/client-s3'
import type { Readable } from 'stream'

export async function putPublicObject(
  s3: S3Client,
  Bucket: string,
  Key: string,
  Body: Readable | Buffer | Uint8Array | string | Blob,
  ContentType: string,
) {
  const uploader = new Upload({
    client: s3,
    params: {
      Bucket,
      Key,
      Body,
      ContentType,
      CacheControl: 'public, max-age=31536000, immutable',
    },
    queueSize: 4,
    partSize: 5 * 1024 * 1024,
    leavePartsOnError: false,
  })
  return uploader.done()
}
