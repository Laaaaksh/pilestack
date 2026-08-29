-- CreateTable
CREATE TABLE "Installation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "accountLogin" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Repository" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "installationId" INTEGER NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Repository_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PullRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "repositoryId" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "authorLogin" TEXT NOT NULL,
    "authorAvatarUrl" TEXT,
    "headRef" TEXT NOT NULL,
    "baseRef" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "url" TEXT NOT NULL,
    "ciStatus" TEXT NOT NULL DEFAULT 'unknown',
    "reviewStatus" TEXT NOT NULL DEFAULT 'none',
    "stackId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PullRequest_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PullRequest_stackId_fkey" FOREIGN KEY ("stackId") REFERENCES "Stack" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Stack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repositoryId" INTEGER NOT NULL,
    "signature" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Stack_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StackComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stackId" TEXT NOT NULL,
    "authorLogin" TEXT NOT NULL,
    "authorAvatarUrl" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StackComment_stackId_fkey" FOREIGN KEY ("stackId") REFERENCES "Stack" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RestackRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stackId" TEXT NOT NULL,
    "triggeredByLogin" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "planJson" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "RestackRun_stackId_fkey" FOREIGN KEY ("stackId") REFERENCES "Stack" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Repository_fullName_key" ON "Repository"("fullName");

-- CreateIndex
CREATE INDEX "Repository_installationId_idx" ON "Repository"("installationId");

-- CreateIndex
CREATE INDEX "PullRequest_repositoryId_headRef_idx" ON "PullRequest"("repositoryId", "headRef");

-- CreateIndex
CREATE INDEX "PullRequest_stackId_idx" ON "PullRequest"("stackId");

-- CreateIndex
CREATE UNIQUE INDEX "PullRequest_repositoryId_number_key" ON "PullRequest"("repositoryId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Stack_repositoryId_signature_key" ON "Stack"("repositoryId", "signature");

-- CreateIndex
CREATE INDEX "StackComment_stackId_idx" ON "StackComment"("stackId");

-- CreateIndex
CREATE INDEX "RestackRun_stackId_idx" ON "RestackRun"("stackId");
