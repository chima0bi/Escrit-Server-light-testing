// Everything here is reachable with no login — this is the buyer's
// entire experience of the product. Kept deliberately small: show the
// item and the seller's verified name, take a payment, and later let
// the buyer confirm or dispute. Nothing here ever writes an escrow
// status directly — that's the escrow service's job, so the rules in
// ARCHITECTURE.md can't be bypassed by a route taking a shortcut.
import { Router } from 'express';
import Joi from 'joi';
import { PaymentLink, LINK_STATUS } from '../models/PaymentLink.js';
import { User } from '../models/User.js';
import { validate } from '../middleware/validate.js';
import { publicLimiter } from '../middleware/rateLimit.js';
import { AppError } from '../middleware/errorHandler.js';
import { initializeTransaction } from '../services/paystack.js';
import { releaseOnBuyerConfirmation, raiseDispute } from '../services/escrow.js';
import { generateReference } from '../utils/reference.js';
import { env } from '../config/env.js';

export const publicRouter = Router();
publicRouter.use(publicLimiter);

async function loadLink(req) {
  const link = await PaymentLink.findById(req.params.id);
  if (!link) throw new AppError(404, 'This payment link does not exist');
  return link;
}

// Buyer-facing view of a link: item details plus the seller's
// *verified* name only — never the raw account number.
publicRouter.get('/:id', async (req, res) => {
  const link = await loadLink(req);
  const seller = await User.findById(link.sellerId);

  res.json({
    link: {
      id: link.id,
      itemName: link.itemName,
      itemDescription: link.itemDescription,
      itemPhotoUrl: link.itemPhotoUrl,
      priceKobo: link.priceKobo,
      status: link.status,
      autoReleaseAt: link.autoReleaseAt,
    },
    seller: {
      businessName: seller.businessName,
      verifiedAccountName: seller.bankAccount?.resolvedAccountName ?? null,
    },
  });
});

const initSchema = Joi.object({
  email: Joi.string().email().required(),
  phone: Joi.string().allow('').default(''),
});

publicRouter.post('/:id/initialize-payment', validate(initSchema), async (req, res) => {
  const link = await loadLink(req);
  if (link.status !== LINK_STATUS.CREATED) {
    throw new AppError(409, 'This link is no longer accepting payment');
  }

  const reference = generateReference('escrit');
  const tx = await initializeTransaction({
    email: req.body.email,
    amountKobo: link.priceKobo,
    reference,
    callbackUrl: `${env.clientOrigin}/r/${link.id}/result`,
    metadata: { linkId: link.id },
  });

  link.paystackReference = reference;
  link.buyerEmail = req.body.email;
  link.buyerPhone = req.body.phone || null;
  await link.save();

  res.json({ authorizationUrl: tx.authorization_url, reference });
});

publicRouter.post('/:id/confirm-receipt', async (req, res) => {
  const link = await loadLink(req);
  const updated = await releaseOnBuyerConfirmation(link);
  res.json({ link: updated });
});

const disputeSchema = Joi.object({
  reason: Joi.string().min(5).max(500).required(),
});

publicRouter.post('/:id/dispute', validate(disputeSchema), async (req, res) => {
  const link = await loadLink(req);
  const updated = await raiseDispute(link, req.body.reason);
  res.json({ link: updated });
});
