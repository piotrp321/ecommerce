import { Badge } from './Badge';

export function StatusBadge({ active }: { active: boolean }) {
  return <Badge tone={active ? 'success' : 'neutral'}>{active ? 'Aktywny' : 'Nieaktywny'}</Badge>;
}
