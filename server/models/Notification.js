import mongoose from 'mongoose'

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    type: {
      type: String,
      enum: ['due_soon', 'overdue', 'loan', 'payment', 'fraud', 'system', 'message', 'verification'],
      default: 'system',
    },
    read: { type: Boolean, default: false },
    relatedId: { type: String, default: '' },
    isSeed: { type: Boolean, default: false },
  },
  { timestamps: true }
)

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 })

export default mongoose.model('Notification', notificationSchema)
