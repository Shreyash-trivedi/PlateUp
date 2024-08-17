-- CreateTable
CREATE TABLE "Speaker" (
    "user_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "expertise" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Speaker_email_key" ON "Speaker"("email");
