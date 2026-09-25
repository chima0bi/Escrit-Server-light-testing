// The escrow state machine. This is the module the whole product's
// trust story depends on: a link's status only ever moves forward
// through one of the transitions below, and every transition that
// releases or refunds money makes a real Paystack call before the
// status is allowed to change. If the Paystack call fails, the status
// does not change — we'd rather show "still held" than lie about a
// payout that didn't happen.
import { env } from '../config/env.js';
import { PaymentLink, LINK_STATUS } from '../models/PaymentLink.js';
import { User } from '../models/User.js';
import { AppError } from '../middleware/errorHandler.js';
import * as paystack from './paystack.js';

/**
 * Called only from the webhook handler, only after signature
 * verification, only for a Paystack event that reports success.
 * Idempotent: calling this twice for the same link is a no-op the
 * second time.
 */
export async function markPaidAndHeld(link) {
  if (link.status !== LINK_STATUS.CREATED) return link; // already processed

  link.status = LINK_STATUS.PAID_HELD;
  link.paidAt = new Date();
  link.autoReleaseAt = new Date(Date.now() + env.autoReleaseHours * 60 * 60 * 1000);
  await link.save();
  return link;
}

async function payOutToSeller(link, reason) {
  const seller = await User.findById(link.sellerId);
  if (!seller?.bankAccount?.paystackRecipientCode) {
    throw new AppError(500, 'Seller has no payout destination on file');
  }

  const transfer = await paystack.initiateTransfer({
    amountKobo: link.priceKobo,
    recipientCode: seller.bankAccount.paystackRecipientCode,
    reason,
    reference: `escrit-payout-${link._id}`,
  });

  link.payoutLog.push({ action: 'transfer_initiated', detail: transfer });
  link.releasedAt = new Date();
  await link.save();
  return transfer;
}

/**
 * Buyer confirms receipt. Only legal while funds are held and no
 * dispute is open.
 */
export async function releaseOnBuyerConfirmation(link) {
  if (link.status !== LINK_STATUS.PAID_HELD) {
    throw new AppError(409, `Cannot release a link in status ${link.status}`);
  }
  await payOutToSeller(link, 'Escrit: buyer confirmed receipt');
  link.status = LINK_STATUS.RELEASED;
  await link.save();
  return link;
}

/**
 * The 72-hour (configurable) safety valve: if the buyer never responds,
 * the seller still gets paid. Prevents buyers from being able to
 * indefinitely freeze a seller's money just by going silent.
 */
export async function releaseOnAutoTimer(link) {
  if (link.status !== LINK_STATUS.PAID_HELD) return link;
  await payOutToSeller(link, 'Escrit: auto-released after window with no dispute');
  link.status = LINK_STATUS.RELEASED;
  await link.save();
  return link;
}

/**
 * Buyer raises a dispute. Freezes the auto-release — the background
 * job skips any link that is not PAID_HELD, so this alone is enough
 * to stop the clock.
 */
export async function raiseDispute(link, reason) {
  if (link.status !== LINK_STATUS.PAID_HELD) {
    throw new AppError(409, `Cannot dispute a link in status ${link.status}`);
  }
  link.status = LINK_STATUS.DISPUTED;
  link.disputeReason = reason;
  link.disputeRaisedAt = new Date();
  await link.save();
  return link;
}

/**
 * Manual dispute resolution (MVP: an internal admin action, not an
 * automated arbitration system — see PRD.md for what's deliberately
 * out of scope).
 */
export async function resolveDispute(link, outcome) {
  if (link.status !== LINK_STATUS.DISPUTED) {
    throw new AppError(409, `Cannot resolve a link in status ${link.status}`);
  }

  if (outcome === 'release') {
    await payOutToSeller(link, 'Escrit: dispute resolved in seller favor');
    link.status = LINK_STATUS.RESOLVED_RELEASED;
  } else if (outcome === 'refund') {
    const refund = await paystack.refundTransaction({
      reference: link.paystackReference,
      amountKobo: link.priceKobo,
    });
    link.payoutLog.push({ action: 'refund_issued', detail: refund });
    link.status = LINK_STATUS.RESOLVED_REFUNDED;
  } else {
    throw new AppError(400, 'outcome must be "release" or "refund"');
  }

  link.resolvedAt = new Date();
  await link.save();
  return link;
}
