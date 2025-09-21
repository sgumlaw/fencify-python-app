-- CreateTable
CREATE TABLE "public"."Blueprint" (
    "id" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "processedUrl" TEXT,
    "name" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastProcessedAt" TIMESTAMP(3),

    CONSTRAINT "Blueprint_pkey" PRIMARY KEY ("id")
);
