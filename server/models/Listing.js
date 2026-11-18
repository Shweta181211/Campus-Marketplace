import mongoose from 'mongoose'

const sellerSchema = new mongoose.Schema(
  {
    name: String,
    trust: Number,
    trustScore: Number,
    avatar: String,
    avatarConfig: { type: mongoose.Schema.Types.Mixed, default: null },
    verified: Boolean,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
)

const listingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    category: { type: String, required: true },
    condition: { type: String, required: true },
    brand: { type: String, default: '' },
    originalPrice: { type: Number, default: 0 },
    askingPrice: { type: Number, default: 0 },
    ageMonths: { type: Number, default: 0 },
    demand: { type: Number, default: 50, min: 0, max: 100 },
    price: { type: Number, required: true },
    type: { type: String, enum: ['buy', 'lend', 'sale', 'borrow'], required: true },
    listingKind: { type: String, enum: ['sale', 'lend', 'borrow'], default: 'sale' },
    lendUnit: { type: String, default: null },
    defaultDueDays: { type: Number, default: 7 },
    location: { type: String, default: 'Campus' },
    geo: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number] },
    },
    geoHash: { type: String, default: null },
    locationSharingEnabled: { type: Boolean, default: false },
    description: { type: String, default: '' },
    descriptionHash: { type: String, default: '' },
    iconKey: { type: String, default: 'other' },
    tape: { type: String, default: 'sky' },
    bg: { type: String, default: 'sky' },
    seller: sellerSchema,
    fairMin: { type: Number, default: 0 },
    fairMax: { type: Number, default: 0 },
    recommendedPrice: { type: Number, default: 0 },
    confidence: { type: Number, default: 70 },
    priceExplanation: { type: String, default: '' },
    aiSource: { type: String, enum: ['ml', 'unavailable', 'seed', 'heuristic'], default: 'unavailable' },
    status: {
      type: String,
      // verification = MEDIUM fraud risk, waiting for the seller's email-OTP confirmation
      enum: ['active', 'sold', 'removed', 'pending', 'held', 'draft', 'reserved', 'verification'],
      default: 'active',
    },
    reservedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reservedUntil: { type: Date, default: null },
    views: { type: Number, default: 0 },
    messageCount: { type: Number, default: 0 },
    images: [{ type: String }],
    imageHashes: [{ type: String }], // sha256 of each photo, used to detect photos reused across sellers
    fraudRiskScore: { type: Number, default: 0, min: 0, max: 1 },
    fraudRiskLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'LOW' },
    fraudSignals: [{ type: String }],
    fraudReviewed: { type: Boolean, default: false },
    fraudReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    fraudReviewedAt: { type: Date, default: null },
    fraudDecision: { type: String, enum: ['pending', 'approved', 'rejected', 'none', 'verified'], default: 'none' },
    fraudAction: { type: String, enum: ['PUBLISH', 'VERIFY', 'HOLD'], default: 'PUBLISH' },
    fraudReasons: [{ feature: String, level: String, text: String, impact: Number, _id: false }],
    fraudSource: { type: String, default: 'heuristic' },
    fraudFeatures: { type: mongoose.Schema.Types.Mixed, default: null }, // snapshot -> future supervised training
    heldReason: { type: String, enum: ['fraud', 'reports', 'suspension', null], default: null },
    reportCount: { type: Number, default: 0 },
    // never sent to clients: serializeListing() strips these
    verifyOtpHash: { type: String, default: null },
    verifyOtpExpiresAt: { type: Date, default: null },
    isSeed: { type: Boolean, default: false },
    trainingExportable: { type: Boolean, default: true },
  },
  { timestamps: true }
)

listingSchema.index({ status: 1, createdAt: -1 })
listingSchema.index({ category: 1, type: 1, price: 1 })
listingSchema.index({ 'seller.userId': 1 })
listingSchema.index({ geo: '2dsphere' })
listingSchema.index({ title: 'text', description: 'text' })
listingSchema.index({ descriptionHash: 1 })
listingSchema.index({ imageHashes: 1 })
listingSchema.index({ isSeed: 1 })

export default mongoose.model('Listing', listingSchema)
