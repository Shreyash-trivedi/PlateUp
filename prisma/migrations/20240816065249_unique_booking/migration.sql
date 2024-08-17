/*
  Warnings:

  - A unique constraint covering the columns `[bookingAt]` on the table `Bookings` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Bookings_bookingAt_key" ON "Bookings"("bookingAt");
