const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const paymentController = require("./payment.controller");

const makeSignature = ({ totalAmount, transactionUuid, productCode, secretKey }) => {
	const msg = `total_amount=${totalAmount},transaction_uuid=${transactionUuid},product_code=${productCode}`;
	return crypto.createHmac("sha256", secretKey).update(msg).digest("base64");
};

test("eSewa trusted success requires a valid signed COMPLETE callback", () => {
	const secretKey = "8gBm/:&EnhH.1/q";
	const decoded = {
		status: "COMPLETE",
		total_amount: "500",
		transaction_uuid: "txn-123",
		product_code: "EPAYTEST",
	};
	decoded.signature = makeSignature({
		totalAmount: decoded.total_amount,
		transactionUuid: decoded.transaction_uuid,
		productCode: decoded.product_code,
		secretKey,
	});

	assert.equal(paymentController.__private__.isEsewaTrustedSuccess(decoded, secretKey), true);
});

test("eSewa trusted success rejects tampered signatures and non-success statuses", () => {
	const secretKey = "8gBm/:&EnhH.1/q";
	const validCallback = {
		status: "COMPLETE",
		total_amount: "500",
		transaction_uuid: "txn-123",
		product_code: "EPAYTEST",
	};
	validCallback.signature = makeSignature({
		totalAmount: validCallback.total_amount,
		transactionUuid: validCallback.transaction_uuid,
		productCode: validCallback.product_code,
		secretKey,
	});

	assert.equal(paymentController.__private__.isEsewaTrustedSuccess(validCallback, secretKey), true);
	assert.equal(paymentController.__private__.isEsewaSuccessfulStatus("SUCCESS"), true);
	assert.equal(paymentController.__private__.isEsewaSuccessfulStatus("pending"), false);

	const tampered = { ...validCallback, signature: `${validCallback.signature.slice(0, -1)}A` };
	assert.equal(paymentController.__private__.isEsewaTrustedSuccess(tampered, secretKey), false);
	assert.equal(paymentController.__private__.isEsewaTrustedSuccess({ ...validCallback, status: "PENDING" }, secretKey), false);
});
