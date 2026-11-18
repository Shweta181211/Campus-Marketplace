import mongoose from 'mongoose'

const watchlistSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
    lastObservedPrice: { type: Number, default: null },
    alertEnabled: { type: Boolean, default: true },
    // any = alert on every drop; percent = drop >= thresholdValue %; amount = drop >= ₹thresholdValue
    thresholdType: { type: String, enum: ['any', 'percent', 'amount'], default: 'any' },
    thresholdValue: { type: Number, default: 0, min: 0 },
    lastAlertAt: { type: Date, default: null },
    isSeed: { type: Boolean, default: false },
  },
  { timestamps: true }
)

watchlistSchema.index({ userId: 1, listingId: 1 }, { unique: true })

export default mongoose.model('Watchlist', watchlistSchema)
