import mongoose from 'mongoose'

/** Every image the user uploads. A listing may only reference URLs that exist here and belong to the same user. */
const uploadSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    url: { type: String, required: true, unique: true },
    publicId: { type: String, required: true },
    provider: { type: String, enum: ['cloudinary', 'local'], required: true },
    bytes: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    format: { type: String, default: '' },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', default: null, index: true },
  },
  { timestamps: true }
)

uploadSchema.index({ listingId: 1, createdAt: 1 })

export default mongoose.model('Upload', uploadSchema)
