import { useLayoutEffect, useRef, type FocusEvent } from 'react';
import { FieldError, Input, Label, Text, TextField } from 'react-aria-components';

type Unit = 'mm' | 'cm';
type DimensionFieldProps = {
  id: string;
  label: string;
  value: string;
  unit: Unit;
  error?: string;
  help?: string;
  onChange: (text: string) => void;
  onUnitChange: (unit: Unit) => void;
  onFocus: () => void;
  onBlur: () => void;
  /** Existing status element, such as the uncertainty line, announced with the field. */
  describedBy?: string;
};

export function DimensionField({
  id,
  label,
  value,
  unit,
  error,
  help,
  onChange,
  onUnitChange,
  onFocus,
  onBlur,
  describedBy,
}: DimensionFieldProps) {
  const groupRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const input = groupRef.current?.querySelector('input');
    if (!input || !describedBy) return;
    const ids = (input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    if (!ids.includes(describedBy)) input.setAttribute('aria-describedby', [...ids, describedBy].join(' '));
  });
  const keepFocus = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    onBlur();
  };
  return (
    <TextField
      id={id}
      className="field"
      value={value}
      onChange={onChange}
      isInvalid={Boolean(error)}
      validationBehavior="aria"
    >
      <Label className="field-label">{label}</Label>
      <div className="dimension-input" ref={groupRef} onFocus={onFocus} onBlur={keepFocus}>
        <Input
          inputMode="decimal"
          autoComplete="off"
          placeholder="미측정"
        />
        <select
          aria-label={`${label} 단위`}
          value={unit}
          onChange={(event) => onUnitChange(event.target.value as Unit)}
        >
          <option value="mm">mm</option>
          <option value="cm">cm</option>
        </select>
      </div>
      {help && (
        <Text slot="description" className="field-help">
          {help}
        </Text>
      )}
      {error && <FieldError className="field-error">{error}</FieldError>}
    </TextField>
  );
}

type CountFieldProps = {
  id: string;
  label: string;
  value: string;
  error?: string;
  help?: string;
  onChange: (text: string) => void;
};

export function CountField({ id, label, value, error, help, onChange }: CountFieldProps) {
  return (
    <TextField
      id={id}
      className="field"
      value={value}
      onChange={onChange}
      isInvalid={Boolean(error)}
      validationBehavior="aria"
    >
      <Label className="field-label">{label}</Label>
      <div className="count-input">
        <Input inputMode="numeric" autoComplete="off" placeholder="미확인" />
        <span aria-hidden="true">개</span>
      </div>
      {help && (
        <Text slot="description" className="field-help">
          {help}
        </Text>
      )}
      {error && <FieldError className="field-error">{error}</FieldError>}
    </TextField>
  );
}
