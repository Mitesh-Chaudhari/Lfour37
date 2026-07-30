export const RETURN_WINDOW_DAYS = 7

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function getReturnWindowDeadline(
  deliveredAt: string,
  windowDays: number = RETURN_WINDOW_DAYS
): Date {
  return new Date(new Date(deliveredAt).getTime() + windowDays * MS_PER_DAY)
}

export function isWithinReturnWindow(
  deliveredAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!deliveredAt) return false

  const deliveredDate = new Date(deliveredAt)
  if (Number.isNaN(deliveredDate.getTime())) return false

  return now.getTime() <= getReturnWindowDeadline(deliveredAt).getTime()
}
