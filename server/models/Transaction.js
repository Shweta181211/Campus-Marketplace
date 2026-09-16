import mongoose from 'mongoose'

const extensionSchema = new mongoose.Schema(
  {
    requestedDays: Number,
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    resolvedAt: Date,
  },
  { _id: true }
)

const transactionSchema = new mongoose.Schema(
  {
    item: { type: String, required: true },
    with: { type: String, required: true },
    amount: { type: Number, required: true },
    type: {
      type: String,
      enum: ['bought', 'sold', 'borrowed', 'lent', 'sale', 'borrow', 'lend'],
      required: true,
    },
    date: { type: String, required: true },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    borrowerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lenderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    startDate: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    returnedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: [
        'REQUESTED',
        'ACTIVE',
        'DUE_SOON',
        'OVERDUE',
        'RETURN_REQUESTED',
        'RETURNED',
        'COMPLETED',
        'REJECTED',
        'PAYMENT_PENDING',
        'PAID',
        'CANCELLED',
      ],
      default: 'REQUESTED',
    },
    overdueStatus: { type: Boolean, default: false },
    extensionCount: { type: Number, default: 0 },
    extensionHistory: [extensionSchema],
    completedAt: { type: Date, default: null },
    meetingPoint: { type: String, default: '' },
    meetingAgreedByBorrower: { type: Boolean, default: false },
    meetingAgreedByLender: { type: Boolean, default: false },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
    isSeed: { type: Boolean, default: false },
  },
  { timestamps: true }
)

transactionSchema.index({ borrowerId: 1, status: 1 })
transactionSchema.index({ lenderId: 1, status: 1 })
transactionSchema.index({ listingId: 1 })
transactionSchema.index({ dueDate: 1, status: 1 })

export default mongoose.model('Transaction', transactionSchema)
