// The core object in the system: one item, one escrow, one buyer.
// `status` is the state machine described in ARCHITECTURE.md — treat
// it as append-only forward motion, never write it from a client value.
import mongoose from 'mongoose';

export const LINK_STATUS = Object.freeze({
  CREATED: 'CREATED',
  PAID_HELD: 'PAID_HELD',
  RELEASED: 'RELEASED',
  DISPUTED: 'DISPUTED',
  RESOLVED_RELEASED: 'RESOLVED_RELEASED',
  RESOLVED_REFUNDED: 'RESOLVED_REFUNDED',
});

const payoutLogEntrySchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    action: { type: String, required: true }, // e.g. "transfer_initiated", "transfer_success", "refund_issued"
    detail: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const paymentLinkSchema = new mongoose.Schema(
  {
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    itemName: { type: String, required: true, trim: true },
    itemDescription: { type: String, trim: true, default: '' },
    itemPhotoUrl: { type: String, default: null },
    priceKobo: { type: Number, required: true, min: 10000 }, // ₦100 minimum, keeps test transfers sane

    status: {
      type: String,
      enum: Object.values(LINK_STATUS),
      default: LINK_STATUS.CREATED,
      index: true,
    },

    // Paystack transaction reference, set at checkout initialization.
    paystackReference: { type: String, default: null, index: true },
    buyerEmail: { type: String, default: null },
    buyerPhone: { type: String, default: null },

    paidAt: { type: Date, default: null },
    autoReleaseAt: { type: Date, default: null },
    releasedAt: { type: Date, default: null },

    disputeReason: { type: String, default: null },
    disputeRaisedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },

    payoutLog: { type: [payoutLogEntrySchema], default: [] },
  },
  { timestamps: true }
);

export const PaymentLink = mongoose.model('PaymentLink', paymentLinkSchema);
