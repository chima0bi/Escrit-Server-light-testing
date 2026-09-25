import { Router } from 'express';
import Joi from 'joi';
import { PaymentLink } from '../models/PaymentLink.js';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/errorHandler.js';

export const linksRouter = Router();
linksRouter.use(requireAuth);

const createLinkSchema = Joi.object({
  itemName: Joi.string().min(2).max(120).required(),
  itemDescription: Joi.string().max(1000).allow('').default(''),
  itemPhotoUrl: Joi.string().uri().allow(null).default(null),
  priceNaira: Joi.number().min(100).required(), // collected in naira, stored in kobo
});

linksRouter.post('/', validate(createLinkSchema), async (req, res) => {
  const seller = await User.findById(req.sellerId);
  if (!seller?.bankAccount) {
    // Enforced here, not just in the UI — a link can't go live for a
    // seller we have no way to pay out.
    throw new AppError(422, 'Add a verified bank account before creating a payment link');
  }

  const { itemName, itemDescription, itemPhotoUrl, priceNaira } = req.body;
  const link = await PaymentLink.create({
    sellerId: seller.id,
    itemName,
    itemDescription,
    itemPhotoUrl,
    priceKobo: Math.round(priceNaira * 100),
  });

  res.status(201).json({ link });
});

linksRouter.get('/', async (req, res) => {
  const links = await PaymentLink.find({ sellerId: req.sellerId }).sort({ createdAt: -1 });
  res.json({ links });
});

linksRouter.get('/:id', async (req, res) => {
  const link = await PaymentLink.findOne({ _id: req.params.id, sellerId: req.sellerId });
  if (!link) throw new AppError(404, 'Link not found');
  res.json({ link });
});
