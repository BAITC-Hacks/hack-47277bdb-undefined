-- Additive only: no changes to existing commerce data or legacy ai tables.
CREATE TABLE "AssistantConversation" (
  "id" UUID NOT NULL,
  "ownerKey" TEXT NOT NULL,
  "sessionId" UUID NOT NULL,
  "userId" UUID,
  "language" TEXT NOT NULL DEFAULT 'kk',
  "citySlug" TEXT,
  "selectedProductId" UUID,
  "recentProductIds" JSONB NOT NULL DEFAULT '[]',
  "history" JSONB NOT NULL DEFAULT '[]',
  "revision" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssistantConversation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssistantConversation_language_check" CHECK ("language" IN ('kk', 'ru'))
);
CREATE TABLE "AssistantPendingAction" (
  "id" UUID NOT NULL,
  "conversationId" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "productId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "cityId" UUID NOT NULL,
  "citySlug" TEXT NOT NULL,
  "unitPrice" DECIMAL(14,2) NOT NULL,
  "productName" TEXT NOT NULL,
  "cartFingerprint" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssistantPendingAction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssistantPendingAction_quantity_check" CHECK ("quantity" BETWEEN 1 AND 10000),
  CONSTRAINT "AssistantPendingAction_price_check" CHECK ("unitPrice" >= 0),
  CONSTRAINT "AssistantPendingAction_status_check" CHECK ("status" IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED'))
);
CREATE UNIQUE INDEX "AssistantConversation_ownerKey_sessionId_key" ON "AssistantConversation"("ownerKey", "sessionId");
CREATE INDEX "AssistantConversation_userId_idx" ON "AssistantConversation"("userId");
CREATE INDEX "AssistantConversation_expiresAt_idx" ON "AssistantConversation"("expiresAt");
CREATE INDEX "AssistantPendingAction_conversationId_status_idx" ON "AssistantPendingAction"("conversationId", "status");
CREATE INDEX "AssistantPendingAction_expiresAt_idx" ON "AssistantPendingAction"("expiresAt");
-- Defense-in-depth: at most one confirmable action per conversation.
CREATE UNIQUE INDEX "AssistantPendingAction_one_pending" ON "AssistantPendingAction"("conversationId") WHERE "status" = 'PENDING';
ALTER TABLE "AssistantConversation" ADD CONSTRAINT "AssistantConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssistantPendingAction" ADD CONSTRAINT "AssistantPendingAction_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
