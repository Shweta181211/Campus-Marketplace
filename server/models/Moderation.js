import mongoose from 'mongoose'

const moderationSchema = new mongoose.Schema(
  {
    listing: { type: String, required: true },
    risk: { type: String, enum: ['Low', 'Medium', 'High', 'LOW', 'MEDIUM', 'HIGH'], required: true },
    reason: { type: String, required: true },
    seller: { type: String, required: true },
    sellerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'reviewed', 'dismissed', 'approved', 'rejected'], default: 'pending' },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' },
    fraudRiskScore: { type: Number, default: 0 },
    signals: [{ type: String }],
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date, default: null },
    isSeed: { type: Boolean, default: false },
  },
  { timestamps: true }
)

moderationSchema.index({ status: 1, createdAt: -1 })
moderationSchema.index({ listingId: 1 })

export default mongoose.model('Moderation', moderationSchema)
