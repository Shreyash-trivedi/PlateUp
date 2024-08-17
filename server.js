import express from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import ical from "ical-generator";

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 8000;
const SECRET_KEY = process.env.SECRET_KEY;

app.use(express.json());

// email client configuration
const transporter = nodemailer.createTransport({
    host: process.env.SMTPHOST,
    port: process.env.SMTPPORT,
    auth: {
        user: process.env.SMTPUSER,
        pass: process.env.SMTPPASS,
    },
});

// middleware to verify jwt token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization;
    if (!token) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        req.user = decoded;
        return next();
    });
};

// middleware to check user_type accessing a specific route
const isUserRole =
    (...roles) =>
    async (req, res, next) => {
        const found = await prisma.user.findFirst({
            where: {
                email: req.user.email,
            },
        });
        if (roles.includes(found.role)) {
            return next();
        }
        return res.status(401).json({ error: "Unauthorized" });
    };

// Route for sign-up functionality, to add new users
app.post("/api/signup", async (req, res) => {
    try {
        // Check if the email already exists
        const existingUser = await prisma.user.findFirst({
            where: {
                email: req.body.email,
            },
        });
        if (existingUser) {
            return res.status(400).json({ error: "Email already exists" });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(req.body.password, 10);

        // Generate and send otp via email
        const otp = Math.floor(100000 + Math.random() * 900000);
        const mailOptions = {
            from: process.env.SMTPUSER,
            to: req.body.email,
            subject: "OTP",
            text: `Your OTP is ${otp}`,
        };
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error(error);
            } else {
                console.log("Email sent: " + info.response);
            }
        });

        // Create a new user
        const newUser = await prisma.user.create({
            data: {
                first_name: req.body.first_name,
                last_name: req.body.last_name,
                email: req.body.email,
                password: hashedPassword,
                role: req.body.role,
                otp: otp.toString(),
            },
        });
        return res
            .status(201)
            .json({ message: "User registered successfully" });
    } catch (error) {
        return res.status(500).json({ error: "Internal server error" });
    }
});

// Route to verify a user through OTP
app.post("/api/verifyotp", async (req, res) => {
    try {
        const currentUser = await prisma.user.findFirst({
            where: {
                email: req.body.email,
            },
        });

        // check if email already verified
        if (currentUser.is_verified) {
            return res.status(200).json({ Message: "User already verified" });
        }

        // verify otp
        const userOtp = await req.body.otp;
        if (currentUser.otp === userOtp) {
            const updateUser = await prisma.user.update({
                where: {
                    email: currentUser.email,
                },
                data: {
                    is_verified: true,
                },
            });
            return res.status(200).json({ Message: "User verified" });
        }
        return res.status(500).json({ error: "Incorrect OTP" });
    } catch (error) {
        return res.status(500).json({ error: "Internal server error" });
    }
});

// Route for login
app.post("/api/login", async (req, res) => {
    try {
        const found = await prisma.user.findFirst({
            where: {
                email: req.body.email,
            },
        });

        // check if user exists
        if (!found) {
            return res.status(401).json({ error: "Invalid Email" });
        }
        if (!found.is_verified) {
            return res.status(400).json({ error: "Verify your account" });
        }

        // match password
        const passwordMatch = await bcrypt.compare(
            req.body.password,
            found.password
        );
        if (!passwordMatch) {
            return res.status(401).json({ error: "Incorrect password" });
        }

        // auth token
        const token = jwt.sign({ email: found.email }, SECRET_KEY);
        return res.status(200).json({ token });
    } catch (error) {
        return res.status(500).json({ error: "Internal server error" });
    }
});

// Route for speaker profile
app.post(
    "/api/speakerprofile",
    verifyToken,
    isUserRole("speaker"),
    async (req, res) => {
        try {
            const found = await prisma.user.findFirst({
                where: {
                    email: req.user.email,
                },
            });
            // create a new speaker profile if it doesn't exist or update if it already exists
            const price = req.body.price;
            const expertise = req.body.expertise;
            const newSpeaker = await prisma.speaker.upsert({
                where: {
                    email: found.email,
                },
                update: {
                    price: parseInt(price),
                    expertise: expertise,
                },
                create: {
                    user_id: found.user_id,
                    email: found.email,
                    price: parseInt(price),
                    expertise: expertise,
                },
            });
            return res.status(200).json({ Message: "Speaker profile created" });
        } catch (error) {
            return res.status(500).json({ error: "Internal server error" });
        }
    }
);

//Route for listing speakers
app.get("/api/speakerslist", verifyToken, isUserRole("user"), async (req, res) => {
    try {
        const speakers = await prisma.speaker.findMany();
        return res.status(200).json({ speakers });
    } catch (error) {
        return res.status(500).json({ error: "Internal server error" });
    }
});

// Route for booking a session with the speaker, sends email notification and google calendar invite
app.post("/api/booking", verifyToken, isUserRole("user"), async (req, res) => {
    try {
        const speakerEmail = req.body.email;
        const bookingSlot = new Date(req.body.slot);
        const end = new Date(bookingSlot); // Create a copy of bookingSlot
        end.setHours(end.getHours() + 1);

        //check if speaker already booked for the requested time slot
        const existingBooking = await prisma.bookings.findFirst({
            where: {
                speaker_email: speakerEmail,
                bookingAt: bookingSlot,
            },
        });
        if (existingBooking) {
            return res
                .status(400)
                .json({ error: "Speaker already booked for this slot" });
        }

        // speaker details
        const speaker = await prisma.speaker.findFirst({
            where: {
                email: speakerEmail,
            },
        });

        //create a new booking
        const newBooking = await prisma.bookings.create({
            data: {
                user_email: req.user.email,
                speaker_email: speakerEmail,
                bookingAt: bookingSlot,
            },
        });

        // calendar object
        const cal = ical();
        const event = cal.createEvent({
            start: bookingSlot,
            end: end, // 1 hour from start
            summary: "Speaker Session",
            location: "<location>",
            description: `Speaker Session with ${speaker.name}`,
            organizer: {
                name: "Test",
                email: process.env.SMTPUSER,
            },
        });

        //send mail
        const mailOptions = {
            from: process.env.SMTPUSER,
            to: [req.user.email, speakerEmail],
            subject: "Booking Confirmed",
            text: `Your session has been booked for ${bookingSlot.toString()}`,
            attachments: [
                {
                    filename: "invite.ics",
                    content: cal.toString(),
                },
            ],
        };
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error(error);
            } else {
                console.log("Email sent: " + info.response);
            }
        });
        return res.status(200).json({ Message: "Booking Succesful" });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// SERVER
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
