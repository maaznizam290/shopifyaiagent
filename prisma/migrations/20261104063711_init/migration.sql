-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MerchantStore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "publicDomain" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'DEMO',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "apiVersion" TEXT NOT NULL DEFAULT '2025-07',
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
    "lastSyncedAt" DATETIME,
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "ownerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MerchantStore_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "shopifyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "onlineStoreUrl" TEXT,
    "publishedOnOnlineStore" BOOLEAN NOT NULL DEFAULT true,
    "imageUrl" TEXT,
    "imagesJson" TEXT NOT NULL DEFAULT '[]',
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "category" TEXT,
    "productType" TEXT,
    "vendor" TEXT,
    "shopifyUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentHash" TEXT,
    "monitorHash" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Product_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "MerchantStore" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "shopifyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sku" TEXT,
    "price" TEXT NOT NULL,
    "compareAtPrice" TEXT,
    "optionsJson" TEXT NOT NULL DEFAULT '[]',
    "inventoryTracked" BOOLEAN NOT NULL DEFAULT true,
    "inventoryQuantity" INTEGER,
    "inventoryPolicy" TEXT NOT NULL DEFAULT 'DENY',
    "availableForSale" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductFact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL DEFAULT 'VERIFIED',
    "sourceRef" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductFact_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MerchantPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minDays" INTEGER,
    "maxDays" INTEGER,
    "regionsJson" TEXT NOT NULL DEFAULT '[]',
    "freeShippingThreshold" TEXT,
    "maxDiscountPercent" TEXT,
    "detail" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MerchantPolicy_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "MerchantStore" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "productUrl" TEXT NOT NULL DEFAULT '',
    "headline" TEXT NOT NULL DEFAULT '',
    "promoText" TEXT NOT NULL DEFAULT '',
    "advertisedPrice" TEXT,
    "discountType" TEXT NOT NULL DEFAULT 'NONE',
    "discountValue" TEXT,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "claimsJson" TEXT NOT NULL DEFAULT '[]',
    "deliveryPromise" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "riskStatus" TEXT,
    "riskScore" INTEGER,
    "lastCheckedAt" DATETIME,
    "originalSnapshot" TEXT NOT NULL DEFAULT '{}',
    "correctedDraftJson" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Campaign_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "MerchantStore" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Campaign_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Campaign_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CampaignCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "riskStatus" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "aiProvider" TEXT,
    "factsSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignCheck_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VerificationFinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checkId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "originalClaim" TEXT NOT NULL,
    "verifiedInfo" TEXT NOT NULL,
    "sourceEvidence" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VerificationFinding_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "CampaignCheck" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CampaignApproval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT,
    "reviewer" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "checkId" TEXT,
    "riskStatusAtDecision" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignApproval_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CampaignApproval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "campaignId" TEXT,
    "level" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "MerchantStore" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT,
    "webhookId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "processedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "WebhookEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "MerchantStore" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Prospect" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT,
    "jobTitle" TEXT,
    "website" TEXT,
    "linkedinUrl" TEXT,
    "email" TEXT,
    "location" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Australia',
    "industry" TEXT,
    "businessType" TEXT,
    "shopifyEvidence" TEXT NOT NULL DEFAULT '',
    "shopifyVerified" BOOLEAN NOT NULL DEFAULT false,
    "employeeCount" INTEGER,
    "problemHypothesis" TEXT NOT NULL DEFAULT '',
    "leadScore" INTEGER NOT NULL DEFAULT 0,
    "scoreBreakdownJson" TEXT NOT NULL DEFAULT '[]',
    "outreachStatus" TEXT NOT NULL DEFAULT 'NEW',
    "notes" TEXT NOT NULL DEFAULT '',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProspectActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prospectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ProspectActivity_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OutreachDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prospectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutreachDraft_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "detailJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "MerchantStore" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantStore_shopDomain_key" ON "MerchantStore"("shopDomain");

-- CreateIndex
CREATE INDEX "Product_storeId_handle_idx" ON "Product"("storeId", "handle");

-- CreateIndex
CREATE UNIQUE INDEX "Product_storeId_shopifyId_key" ON "Product"("storeId", "shopifyId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_productId_shopifyId_key" ON "ProductVariant"("productId", "shopifyId");

-- CreateIndex
CREATE INDEX "ProductFact_productId_idx" ON "ProductFact"("productId");

-- CreateIndex
CREATE INDEX "MerchantPolicy_storeId_type_idx" ON "MerchantPolicy"("storeId", "type");

-- CreateIndex
CREATE INDEX "Campaign_storeId_riskStatus_idx" ON "Campaign"("storeId", "riskStatus");

-- CreateIndex
CREATE INDEX "Campaign_productId_idx" ON "Campaign"("productId");

-- CreateIndex
CREATE INDEX "CampaignCheck_campaignId_createdAt_idx" ON "CampaignCheck"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "VerificationFinding_checkId_idx" ON "VerificationFinding"("checkId");

-- CreateIndex
CREATE INDEX "CampaignApproval_campaignId_idx" ON "CampaignApproval"("campaignId");

-- CreateIndex
CREATE INDEX "Notification_storeId_read_idx" ON "Notification"("storeId", "read");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_webhookId_key" ON "WebhookEvent"("webhookId");

-- CreateIndex
CREATE INDEX "Prospect_outreachStatus_idx" ON "Prospect"("outreachStatus");

-- CreateIndex
CREATE INDEX "Prospect_leadScore_idx" ON "Prospect"("leadScore");

-- CreateIndex
CREATE INDEX "ProspectActivity_prospectId_idx" ON "ProspectActivity"("prospectId");

-- CreateIndex
CREATE INDEX "OutreachDraft_prospectId_idx" ON "OutreachDraft"("prospectId");

-- CreateIndex
CREATE INDEX "AuditLog_storeId_createdAt_idx" ON "AuditLog"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");
