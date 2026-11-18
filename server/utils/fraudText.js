/** Text red flags. Kept in sync with ml-service/app/services/fraud_features.py (CONTACT_RX / URGENCY_RX). */
const CONTACT_RX =
  /(\+?91[\s-]?)?[6-9]\d{9}|whats\s?app|telegram|upi\s?id|@ok(axis|hdfc|icici|sbi)|@ybl|@paytm|gpay|phonepe|pay\s+(outside|directly|in advance)|advance\s+payment|bank\s+transfer/gi
const URGENCY_RX = /urgent|today only|first come|hurry|asap|advance|token amount|limited time|leaving campus tonight/gi

export function contactScore(text = '') {
  return Math.min(3, (String(text).match(CONTACT_RX) || []).length)
}

export function urgencyScore(text = '') {
  return Math.min(3, (String(text).match(URGENCY_RX) || []).length)
}
