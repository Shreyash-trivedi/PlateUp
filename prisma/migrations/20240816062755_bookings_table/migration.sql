-- CreateTable
CREATE TABLE "Bookings" (
    "booking_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_email" TEXT NOT NULL,
    "speaker_email" TEXT NOT NULL,
    "bookingAt" DATETIME NOT NULL
);
