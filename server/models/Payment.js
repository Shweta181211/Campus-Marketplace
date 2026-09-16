import mongoose from 'mongoose'

const paymentSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true },
    providerPaymentId: { type: String, default: '' },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: {
      type: String,
      enum: ['created', 'paid', 'failed', 'cancelled', 'refunded'],
      default: 'created',
    },
    provider: { type: String, enum: ['razorpay', 'dev'], default: 'dev' },
    signature: { type: String, default: '' },
    verified: { type: Boolean, default: false },
    raw: { type: mongoose.Schema.Types.Mixed, default: {} },
    isSeed: { type: Boolean, default: false },
  },
  { timestamps: true }
)

paymentSchema.index({ userId: 1, createdAt: -1 })
paymentSchema.index({ listingId: 1 })

export default mongoose.model('Payment', paymentSchema)
