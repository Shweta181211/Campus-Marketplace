import mongoose from 'mongoose'

/** A report filed by a student (listing, user or chat message) or by the system. Admins confirm or dismiss it. */
const fraudReportSchema = new mongoose.Schema(
  {
    targetType: { type: String, enum: ['listing', 'user', 'message'], default: 'listing' },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    conversationId: { type: String, default: '' },
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    accusedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, required: true },
    category: {
      type: String,
      enum: ['scam', 'fake_listing', 'prohibited_item', 'harassment', 'spam', 'no_show', 'other'],
      default: 'other',
    },
    details: { type: String, default: '' },
    riskScore: { type: Number, default: 0 }, // fraud-model risk of the listing at report time
    status: { type: String, enum: ['open', 'confirmed', 'dismissed'], default: 'open' },
    severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    adminNote: { type: String, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    isSeed: { type: Boolean, default: false },
  },
  { timestamps: true }
)

fraudReportSchema.index({ status: 1, createdAt: -1 })
fraudReportSchema.index({ accusedUserId: 1, status: 1 })
fraudReportSchema.index({ listingId: 1, status: 1 })

export default mongoose.model('FraudReport', fraudReportSchema)
