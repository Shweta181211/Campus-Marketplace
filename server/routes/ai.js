import { Router } from 'express'
import { requireAuth, requireVerified } from '../middleware/auth.js'
import { recommendPrice, assessListingFraud } from '../utils/ai.js'

const router = Router()

router.post('/price-predict', requireAuth, requireVerified, async (req, res) => {
  try {
    const { category, brand, title, originalPrice, ageMonths, condition, demand, listingType, lendUnit } = req.body || {}
    if (!category || originalPrice == null || !condition) {
      return res.status(400).json({ error: 'category, originalPrice and condition are required' })
    }
    const result = await recommendPrice({
      category,
      brand: brand || '',
      title: title || '',
      originalPrice: Number(originalPrice),
      ageMonths: Number(ageMonths || 0),
      condition,
      demand: Number(demand || 50),
      listingType: listingType || 'sale',
      lendUnit: lendUnit || 'day',
    })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/fraud-score', requireAuth, requireVerified, async (req, res) => {
  try {
    const assessment = await assessListingFraud({
      listing: req.body || {},
      seller: req.user,
    })
    res.json({
      fraudRiskScore: assessment.fraudRiskScore,
      fraudRiskLevel: assessment.fraudRiskLevel,
      fraudSignals: assessment.fraudSignals,
      source: assessment.source,
      disclaimer: 'Risk score is an automated signal, not an accusation of fraud.',
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
