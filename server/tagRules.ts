export function normalizeTagIds(tagIds: number[]) {
  const normalized = Array.from(new Set(tagIds));
  if (normalized.some(tagId => !Number.isInteger(tagId) || tagId <= 0)) throw new Error("Tags must use valid identifiers.");
  if (normalized.length > 12) throw new Error("A transaction can have up to 12 custom tags.");
  return normalized;
}

export function assertTagOwnership(requestedTagIds: number[], ownedTagIds: number[]) {
  const requested = normalizeTagIds(requestedTagIds);
  const owned = new Set(ownedTagIds);
  if (requested.some(tagId => !owned.has(tagId))) throw new Error("One or more tags are not in your workspace.");
  return requested;
}

export function filterTransactionsByTag<T extends { tags: Array<{ id: number }> }>(transactions: T[], tagId?: number) {
  return tagId ? transactions.filter(transaction => transaction.tags.some(tag => tag.id === tagId)) : transactions;
}

export function filterTransactionsByDate<T, K extends keyof T>(transactions: T[], start: Date, end: Date, dateKey: K) {
  return transactions.filter(transaction => {
    const value = transaction[dateKey];
    return value instanceof Date && value >= start && value <= end;
  });
}

export function attachPersistedTags<T extends { id: number }, K extends string>(transactions: T[], assignments: Array<Record<K, number> & { id: number; name: string }>, transactionKey: K) {
  const tagsByTransaction = new Map<number, Array<{ id: number; name: string }>>();
  assignments.forEach(assignment => {
    const transactionId = assignment[transactionKey];
    tagsByTransaction.set(transactionId, [...(tagsByTransaction.get(transactionId) ?? []), { id: assignment.id, name: assignment.name }]);
  });
  return transactions.map(transaction => ({ ...transaction, tags: tagsByTransaction.get(transaction.id) ?? [] }));
}

export function buildTagSummary<T extends { amountCents: number; tags: Array<{ id: number }> }, U extends { sourceType: string; tags: Array<{ id: number }> }>(tagRows: Array<{ id: number; name: string }>, expenses: T[], entries: U[], selectedTagId?: number) {
  return tagRows.filter(tag => !selectedTagId || tag.id === selectedTagId).map(tag => ({
    ...tag,
    expenseCents: filterTransactionsByTag(expenses, tag.id).reduce((total, expense) => total + expense.amountCents, 0),
    manualEntryCount: filterTransactionsByTag(entries, tag.id).filter(entry => entry.sourceType === "manual").length,
  }));
}
