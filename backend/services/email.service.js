const nodemailer = require("nodemailer");
const { SMTPConfig, buildSmtpConfig } = require("../config/config");

class EmailService {
	#transport;
	#smtp;

	constructor() {
		const smtp = SMTPConfig || buildSmtpConfig();
		if (!smtp) {
			throw new Error("SMTP not configured");
		}

		this.#smtp = smtp;

		// Use explicit host/port so `.env` settings are always honored.
		// (Nodemailer `service` presets can override port/secure defaults.)
		const transportOptions = {
			host: smtp.host,
			port: smtp.port,
			secure: smtp.secure,
			requireTLS: smtp.requireTLS,
			auth: {
				user: smtp.user,
				pass: smtp.password,
			},
		};

		this.#transport = nodemailer.createTransport(transportOptions);
	}

	verify = async () => this.#transport.verify();

	sendEmail = async ({ to, sub, message, text = undefined, attachments = null, cc = null, bcc = null, from = null }) => {
		const mailBody = {
			from: from || this.#smtp.from,
			to,
			subject: sub,
			html: message,
		};

		if (text) mailBody.text = text;
		if (cc) mailBody.cc = cc;
		if (bcc) mailBody.bcc = bcc;
		if (attachments) mailBody.attachments = attachments;

		return this.#transport.sendMail(mailBody);
	};
}

module.exports = EmailService;
