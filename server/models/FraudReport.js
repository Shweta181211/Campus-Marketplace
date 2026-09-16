import mongoose from 'mongoose'

const fraudReportSchema = new mongoose.Schema(
  {
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' },
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    accusedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, required: true },
    status: { type: String, enum: ['open', 'confirmed', 'dismissed'], default: 'open' },
    isSeed: { type: Boolean, default: false },
  },
  { timestamps: true }
)

export default mongoose.model('FraudReport', fraudReportSchema)
