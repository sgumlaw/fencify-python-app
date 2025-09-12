declare module 'multer' {
  import type { RequestHandler } from 'express'

  type StorageEngine = unknown

  interface Limits {
    fieldNameSize?: number
    fieldSize?: number
    fields?: number
    fileSize?: number
    files?: number
    parts?: number
    headerPairs?: number
  }

  namespace multer {
    function memoryStorage(): StorageEngine
  }

  interface Options {
    storage?: StorageEngine
    limits?: Limits
    fileFilter?: (
      req: import('express').Request,
      file: Express.Multer.File,
      cb: (error: Error | null, acceptFile: boolean) => void,
    ) => void
  }

  interface Multer {
    single(field: string): RequestHandler
    array(field: string, maxCount?: number): RequestHandler
    fields(fields: Array<{ name: string; maxCount?: number }>): RequestHandler
    none(): RequestHandler
    any(): RequestHandler
  }

  function multer(options?: Options): Multer

  export = multer
}
