import 'express'

declare global {
  namespace Express {
    namespace Multer {
      interface File {
        /** Field name specified in the form */
        fieldname: string
        /** Name of the file on the user's computer */
        originalname: string
        /** Encoding type of the file */
        encoding: string
        /** Mime type of the file */
        mimetype: string
        /** Size of the file in bytes */
        size: number
        /** A Buffer of the entire file */
        buffer: Buffer
      }
    }
  }
}

export {}

declare module 'express-serve-static-core' {
  interface Request {
    file?: Express.Multer.File
    files?: Express.Multer.File[] | Record<string, Express.Multer.File[]>
  }
}
