const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const nodemailer = require("nodemailer");
const { buildSmtpConfig } = require("../config/config");

const safeString = (v) => String(v == null ? "" : v).trim();

const run = async () => {
  try {
    const smtp = buildSmtpConfig();
    if (!smtp) {
      console.error("SMTP not configured. Check SMTP_PROVIDER/SMTP_HOST/SMTP_USER/SMTP_PASSWORD in backend/.env");
      process.exitCode = 2;
      return;
    }

    console.log("Using SMTP host:", smtp.host, "port:", smtp.port, "user:", smtp.user);

    const transportOptions = {
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      requireTLS: smtp.requireTLS,
      auth: { user: smtp.user, pass: smtp.password },
    };

    const transporter = nodemailer.createTransport(transportOptions);

    console.log("Verifying SMTP connection (this may take a few seconds)...");
    await transporter.verify();
    console.log("SMTP verify: OK");

    // Try sending a small test message to the configured sender (self-send).
    const to = safeString(process.env.SMTP_TEST_TO) || smtp.user;
    const from = smtp.from || smtp.user;

    console.log(`Sending test message from ${from} to ${to} ...`);
    const info = await transporter.sendMail({
      from,
      to,
      subject: "SmartBus SMTP test message",
      text: `This is a short SMTP verification message. If you received this, SMTP credentials are valid. (${new Date().toISOString()})`,
    });

    console.log("Test message sent. MessageId:", info.messageId || info.response);
    process.exitCode = 0;
  } catch (err) {
    console.error("SMTP test failed:", err && err.message ? err.message : err);
    if (err?.code === "EAUTH" || Number(err?.responseCode || 0) === 535) {
      console.error("Gmail SMTP auth failed (EAUTH/535). If you use Gmail, create a 16-character App Password and set it as `SMTP_PASSWORD` in backend/.env (spaces are stripped).");
    }
    process.exitCode = 3;
  }
};

run();
