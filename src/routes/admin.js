// Minimal internal surface for the MVP's manual dispute resolution
// (see PRD.md - automated arbitration is explicitly out of scope).
// Gated by requireAuth + requireAdmin (an ADMIN_EMAILS allowlist) -
// so only sellers explicitly configured as admins can see or touch
// another seller's dispute.
import { Router } from 'express';
import Joi from 'joi';
import { PaymentLink, LINK_STATUS } from '../models/PaymentLink.js';
import { User } from '../models/User.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/errorHandler.js';
import { resolveDispute } from '../services/escrow.js';
import { runAutoReleaseSweepNow } from '../services/autoRelease.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

// Previously missing entirely: the only way to resolve a dispute was
// POST /disputes/:id/resolve, but nothing surfaced *which* links were
// disputed in the first place - a disputed link was a dead end with
// no UI anywhere in the product. This is what the admin dispute
// dashboard reads.
adminRouter.get('/disputes', async (_req, res) => {
  const links = await PaymentLink.find({ status: LINK_STATUS.DISPUTED }).sort({ disputeRaisedAt: 1 });
  const sellerIds = [...new Set(links.map((l) => String(l.sellerId)))];
  const sellers = await User.find({ _id: { $in: sellerIds } }).select('email businessName');
  const sellerById = Object.fromEntries(sellers.map((s) => [String(s._id), s]));

  res.json({
    disputes: links.map((link) => ({
      link,
      seller: sellerById[String(link.sellerId)] || null,
    })),
  });
});

const resolveSchema = Joi.object({
  outcome: Joi.string().valid('release', 'refund').required(),
});

adminRouter.post('/disputes/:id/resolve', validate(resolveSchema), async (req, res) => {
  const link = await PaymentLink.findById(req.params.id);
  if (!link) throw new AppError(404, 'Link not found');

  const updated = await resolveDispute(link, req.body.outcome);
  res.json({ link: updated });
});

// Demo convenience: trigger the auto-release sweep immediately instead
// of waiting for the real 72-hour window during judging.
adminRouter.post('/run-auto-release', async (_req, res) => {
  await runAutoReleaseSweepNow();
  res.status(204).end();
});
