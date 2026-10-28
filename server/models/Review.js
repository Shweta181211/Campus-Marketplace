import mongoose from 'mongoose'

const reviewSchema = new mongoose.Schema(
  {
    from: { type: String, required: true },
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    avatar: { type: String, default: '🐨' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, required: true },
    forUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    isSeed: { type: Boolean, default: false },
  },
  { timestamps: true }
)

reviewSchema.index({ forUserId: 1, createdAt: -1 })

export default mongoose.model('Review', reviewSchema)
