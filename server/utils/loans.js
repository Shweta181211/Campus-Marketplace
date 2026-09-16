import Transaction from '../models/Transaction.js'
import Notification from '../models/Notification.js'

export function loanStatusFromDates({ dueDate, status, returnedAt }) {
  if (['COMPLETED', 'REJECTED', 'CANCELLED', 'RETURNED'].includes(status) && status !== 'RETURNED') {
    return { status, overdueStatus: false }
  }
  if (status === 'REQUESTED' || status === 'PAYMENT_PENDING') {
    return { status, overdueStatus: false }
  }
  if (returnedAt || status === 'RETURN_REQUESTED') {
    return { status: status === 'RETURN_REQUESTED' ? 'RETURN_REQUESTED' : 'RETURNED', overdueStatus: false }
  }
  if (!dueDate) return { status: status || 'ACTIVE', overdueStatus: false }
  const due = new Date(dueDate).getTime()
  const now = Date.now()
  const soon = 2 * 24 * 60 * 60 * 1000
  if (now > due) return { status: 'OVERDUE', overdueStatus: true }
  if (due - now <= soon) return { status: 'DUE_SOON', overdueStatus: false }
  return { status: 'ACTIVE', overdueStatus: false }
}

export function remainingLabel(dueDate) {
  if (!dueDate) return ''
  const diff = new Date(dueDate).getTime() - Date.now()
  const days = Math.round(diff / 86400000)
  if (days > 1) return `Due in ${days} days`
  if (days === 1) return 'Due in 1 day'
  if (days === 0) return 'Due today'
  if (days === -1) return '1 day overdue'
  return `${Math.abs(days)} days overdue`
}

export async function refreshLoanStatuses() {
  const open = await Transaction.find({
    type: { $in: ['borrowed', 'lent', 'borrow', 'lend'] },
    status: { $in: ['ACTIVE', 'DUE_SOON', 'OVERDUE', 'REQUESTED'] },
    dueDate: { $ne: null },
  })

  for (const txn of open) {
    if (txn.status === 'REQUESTED') continue
    const next = loanStatusFromDates(txn)
    const changed = next.status !== txn.status || next.overdueStatus !== txn.overdueStatus
    if (!changed) continue
    txn.status = next.status
    txn.overdueStatus = next.overdueStatus
    await txn.save()

    const users = [txn.borrowerId, txn.lenderId, txn.userId].filter(Boolean)
    const title = next.status === 'OVERDUE' ? 'Item overdue' : 'Due soon'
    const body = `${txn.item}: ${remainingLabel(txn.dueDate)}`
    for (const userId of users) {
      const exists = await Notification.findOne({
        userId,
        relatedId: String(txn._id),
        type: next.status === 'OVERDUE' ? 'overdue' : 'due_soon',
        createdAt: { $gte: new Date(Date.now() - 12 * 60 * 60 * 1000) },
      })
      if (exists) continue
      await Notification.create({
        userId,
        title,
        body,
        type: next.status === 'OVERDUE' ? 'overdue' : 'due_soon',
        relatedId: String(txn._id),
      })
    }
  }
}
