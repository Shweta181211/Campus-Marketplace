import mongoose from 'mongoose'

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    avatar: { type: String, default: '🐨' },
    preview: { type: String, required: true },
    body: { type: String, default: '' },
    time: { type: String, default: 'just now' },
    unread: { type: Boolean, default: true },
    item: { type: String, default: '' },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' },
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isSeed: { type: Boolean, default: false },
  },
  { timestamps: true }
)

messageSchema.index({ fromUserId: 1, toUserId: 1, createdAt: -1 })

export default mongoose.model('Message', messageSchema)
