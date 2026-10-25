import { Icon } from '../components/Icon';

export function DemoBanner() {
  return (
    <div className="demo-banner" role="note" aria-label="Tryb demonstracyjny">
      <Icon name="flask" size={16} />
      <p>
        <strong>Tryb demonstracyjny.</strong> Dane są fikcyjne i istnieją tylko w tej karcie przeglądarki; odświeżenie strony
        przywraca stan początkowy. Panel nie jest połączony z API sklepu.
      </p>
    </div>
  );
}
