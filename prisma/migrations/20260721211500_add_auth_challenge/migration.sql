-- CreateTable
CREATE TABLE "auth_challenge" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "public_key" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_challenge_challenge_key" ON "auth_challenge"("challenge");

-- CreateIndex
CREATE INDEX "auth_challenge_public_key_idx" ON "auth_challenge"("public_key");
