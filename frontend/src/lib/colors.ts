const COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316']

export function matterColor(matterId: number): string {
  return COLORS[matterId % COLORS.length]
}
