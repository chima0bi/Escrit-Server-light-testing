// Every call this app makes to Paystack lives in this one file. Keeping
// the HTTP integration in a single place means the rest of the app
// never touches fetch/axios directly for payments — easier to audit,
// easier to mock in tests, easier to swap providers later if needed.
import axios from 'axios';
import { env } from '../config/env.js';

const client = axios.create({
  baseURL: env.paystack.baseUrl,
  headers: {
    Authorization: `Bearer ${env.paystack.secretKey}`,
    'Content-Type': 'application/json',
  },
});

// --- Checkout -------------------------------------------------------

/**
 * Starts a Paystack transaction. Returns the authorization_url the
 * buyer is redirected to (or used inline, client-side).
 */
export async function initializeTransaction({ email, amountKobo, reference, callbackUrl, metadata }) {
  const { data } = await client.post('/transaction/initialize', {
    email,
    amount: amountKobo,
    reference,
    callback_url: callbackUrl,
    metadata,
  });
  return data.data; // { authorization_url, access_code, reference }
}

/**
 * Server-side re-verification of a transaction. We call this as a
 * belt-and-braces check even though the webhook is the real source of
 * truth — it lets us confirm state on demand (e.g. if a webhook was
 * delayed) without ever trusting the client's own claim of success.
 */
export async function verifyTransaction(reference) {
  const { data } = await client.get(`/transaction/verify/${encodeURIComponent(reference)}`);
  return data.data; // includes status: 'success' | 'failed' | ...
}

// --- Payouts ----------------------------------------------------------

/**
 * Confirms a Nigerian bank account actually belongs to the name the
 * seller claims. This is the trust primitive the whole product rests
 * on: buyers see this resolved name before paying, so a fake account
 * number can't quietly collect their money.
 */
export async function resolveAccountNumber({ accountNumber, bankCode }) {
  const { data } = await client.get('/bank/resolve', {
    params: { account_number: accountNumber, bank_code: bankCode },
  });
  return data.data; // { account_number, account_name }
}

/**
 * Registers a payout destination with Paystack. The returned
 * recipient_code is what we store and reuse for every future payout
 * to this seller — we never re-collect bank details per transaction.
 */
export async function createTransferRecipient({ accountNumber, bankCode, accountName }) {
  const { data } = await client.post('/transferrecipient', {
    type: 'nuban',
    name: accountName,
    account_number: accountNumber,
    bank_code: bankCode,
    currency: 'NGN',
  });
  return data.data; // { recipient_code, ... }
}

/**
 * Moves money out of the platform's Paystack balance to the seller.
 * Called only from the escrow service, only when a link's state
 * machine says a release is allowed — never directly from a route.
 */
export async function initiateTransfer({ amountKobo, recipientCode, reason, reference }) {
  const { data } = await client.post('/transfer', {
    source: 'balance',
    amount: amountKobo,
    recipient: recipientCode,
    reason,
    reference,
  });
  return data.data; // { transfer_code, status, ... }
}

/**
 * Refunds the buyer's original charge — used when a dispute resolves
 * in the buyer's favor.
 */
export async function refundTransaction({ reference, amountKobo }) {
  const { data } = await client.post('/refund', {
    transaction: reference,
    amount: amountKobo,
  });
  return data.data;
}

// --- List of banks (used by the seller's bank-account form) --------

export async function listBanks() {
  const { data } = await client.get('/bank', { params: { country: 'nigeria' } });
  return data.data; // [{ name, code, ... }]
}
