import mongoose from 'mongoose'

const watchlistSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
    isSeed: { type: Boolean, default: false },
  },
  { timestamps: true }
)

watchlistSchema.index({ userId: 1, listingId: 1 }, { unique: true })

export default mongoose.model('Watchlist', watchlistSchema)
