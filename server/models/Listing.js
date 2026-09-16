import mongoose from 'mongoose'

const sellerSchema = new mongoose.Schema(
  {
    name: String,
    trust: Number,
    trustScore: Number,
    avatar: String,
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
      enum: ['active', 'sold', 'removed', 'pending', 'held', 'draft'],
      default: 'active',
    },
    views: { type: Number, default: 0 },
    messageCount: { type: Number, default: 0 },
    images: [{ type: String }],
    fraudRiskScore: { type: Number, default: 0, min: 0, max: 1 },
    fraudRiskLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'LOW' },
    fraudSignals: [{ type: String }],
    fraudReviewed: { type: Boolean, default: false },
    fraudReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    fraudReviewedAt: { type: Date, default: null },
    fraudDecision: { type: String, enum: ['pending', 'approved', 'rejected', 'none'], default: 'none' },
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
listingSchema.index({ isSeed: 1 })

export default mongoose.model('Listing', listingSchema)
