import AuditLog from '../models/AuditLog.js'

export async function audit(action, { actor = null, targetUserId = null, targetListingId = null, before = null, after = null, reason = '' } = {}) {
  try {
    await AuditLog.create({
      action,
      actorId: actor?._id || null,
      actorName: actor?.name || 'system',
      targetUserId,
      targetListingId,
      before,
      after,
      reason,
    })
  } catch (err) {
    console.warn('audit log failed', err.message) // never break the request because of logging
  }
}
