import mongoose from 'mongoose'

/** Institution configuration managed by admins: allowed categories and banned words. Single document. */
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'marketplace', unique: true },
    bannedWords: { type: [String], default: [] },
    categories: [
      {
        _id: false,
        id: { type: String, required: true },
        label: { type: String, required: true },
        tape: { type: String, default: 'moss' },
        enabled: { type: Boolean, default: true },
      },
    ],
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
)

export default mongoose.model('Settings', settingsSchema)
