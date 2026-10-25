import { useEffect, useState } from 'react';
import { Icon } from './Icon';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  /** Delay before onChange, so typing does not send a request per key. */
  debounceMs?: number;
}

export function SearchInput({ value, onChange, label, placeholder, debounceMs = 300 }: SearchInputProps) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);

  // Follow outside changes (e.g. "clear filters") without an effect, but keep
  // what the user is typing when the outside value is just its trimmed form.
  if (value !== synced) {
    setSynced(value);
    if (value !== draft.trim()) {
      setDraft(value);
    }
  }

  useEffect(() => {
    if (draft.trim() === value) {
      return;
    }
    const timer = setTimeout(() => {
      onChange(draft);
    }, debounceMs);

    return () => {
      clearTimeout(timer);
    };
  }, [draft, value, onChange, debounceMs]);

  return (
    <div className="search">
      <Icon name="search" className="search__icon" />
      <input
        type="search"
        className="input search__input"
        aria-label={label}
        placeholder={placeholder}
        value={draft}
        maxLength={100}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            onChange(draft);
          }
        }}
      />
    </div>
  );
}
