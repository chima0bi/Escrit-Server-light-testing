// The seller account. Buyers never get a User document — that's a
// deliberate product decision (zero-signup checkout), not an oversight.
import mongoose from 'mongoose';

const bankAccountSchema = new mongoose.Schema(
  {
    accountNumber: { type: String, required: true },
    bankCode: { type: String, required: true },
    bankName: { type: String, required: true },
    // Filled in by Paystack's "resolve account number" call — this is
    // the name we show buyers as proof the payout destination is real.
    resolvedAccountName: { type: String, required: true },
    // Returned by Paystack when we register a Transfer Recipient.
    // Required before any payout can be attempted.
    paystackRecipientCode: { type: String, required: true },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    businessName: { type: String, required: true, trim: true },
    bankAccount: { type: bankAccountSchema, default: null },
  },
  { timestamps: true }
);

// Never let a password hash leak into an API response by accident.
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);
