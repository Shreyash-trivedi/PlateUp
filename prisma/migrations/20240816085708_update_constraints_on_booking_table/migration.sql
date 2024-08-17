/*
  Warnings:

  - A unique constraint covering the columns `[speaker_email,bookingAt]` on the table `Bookings` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Bookings_bookingAt_key";

-- CreateIndex
CREATE UNIQUE INDEX "Bookings_speaker_email_bookingAt_key" ON "Bookings"("speaker_email", "bookingAt");
