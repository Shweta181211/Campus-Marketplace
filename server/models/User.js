import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: '' },
    googleId: { type: String, default: null, index: true },
    authProvider: { type: String, enum: ['password', 'google'], default: 'password' },
    initials: { type: String, default: '' },
    avatar: { type: String, default: '🦊' },
    hostel: { type: String, default: '' },
    trust: { type: Number, default: 4.0 },
    trustScore: { type: Number, default: 55, min: 0, max: 100 },
    rating: { type: Number, default: 4.0 },
    reviewCount: { type: Number, default: 0 },
    verified: { type: Boolean, default: false },
    verificationStatus: {
      type: String,
      enum: ['unverified', 'pending', 'verified', 'failed'],
      default: 'unverified',
    },
    listingsCount: { type: Number, default: 0 },
    joined: { type: String, default: '' },
    role: { type: String, enum: ['student', 'admin'], default: 'student' },
    isSeed: { type: Boolean, default: false },
    confirmedReports: { type: Number, default: 0 },
    otpHash: { type: String, default: null, select: false },
    otpExpiresAt: { type: Date, default: null, select: false },
    otpAttempts: { type: Number, default: 0, select: false },
    otpSentAt: { type: Date, default: null, select: false },
    resendCount: { type: Number, default: 0, select: false },
    locationSharingEnabled: { type: Boolean, default: false },
    locationExact: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number] },
    },
    locationApprox: {
      geohash: { type: String, default: null },
      label: { type: String, default: '' },
    },
    locationUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

userSchema.index({ locationExact: '2dsphere' })
userSchema.index({ isSeed: 1 })

userSchema.methods.toPublicJSON = function () {
  const obj = this.toObject({ virtuals: true })
  delete obj.passwordHash
  delete obj.otpHash
  delete obj.otpExpiresAt
  delete obj.otpAttempts
  delete obj.otpSentAt
  delete obj.resendCount
  delete obj.locationExact
  obj.id = obj._id.toString()
  return obj
}

export default mongoose.model('User', userSchema)
