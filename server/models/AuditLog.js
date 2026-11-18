import mongoose from 'mongoose'

/**
 * Append-only audit trail (PDF section 14): every trust-score change and every admin action that affects a
 * student (suspend, report decision, listing review, settings change) is recorded with who did it and why.
 */
const auditSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, index: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = system
    actorName: { type: String, default: 'system' },
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    targetListingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', default: null },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    reason: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

auditSchema.index({ createdAt: -1 })

export default mongoose.model('AuditLog', auditSchema)
