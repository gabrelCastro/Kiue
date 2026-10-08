import type { ComponentChildren } from 'preact';

interface FieldProps {
  label: string;
  help?: ComponentChildren;
  children: ComponentChildren;
}

export function Field({ label, help, children }: FieldProps) {
  return (
    <label class="field">
      <span class="field-label">{label}</span>
      {children}
      {help && <span class="field-help">{help}</span>}
    </label>
  );
}

interface NumberProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  help?: ComponentChildren;
  disabled?: boolean;
  onChange: (v: number) => void;
}

/** Slider + campo numérico. */
export function NumberField({ label, value, min, max, step = 1, unit, help, disabled, onChange }: NumberProps) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <Field label={label} help={help}>
      <div class="number-field">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onInput={(e) => onChange(clamp(Number((e.target as HTMLInputElement).value)))}
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const v = Number((e.target as HTMLInputElement).value);
            if (!Number.isNaN(v)) onChange(clamp(v));
          }}
        />
        {unit && <span class="unit">{unit}</span>}
      </div>
    </Field>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  help?: ComponentChildren;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}

export function Toggle({ label, checked, help, disabled, onChange }: ToggleProps) {
  return (
    <label class={`toggle ${disabled ? 'disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      <span class="toggle-track" aria-hidden="true" />
      <span class="toggle-text">
        <span>{label}</span>
        {help && <span class="field-help">{help}</span>}
      </span>
    </label>
  );
}

interface SelectProps<T extends string | number> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  help?: ComponentChildren;
  disabled?: boolean;
  onChange: (v: T) => void;
}

export function Select<T extends string | number>({ label, value, options, help, disabled, onChange }: SelectProps<T>) {
  return (
    <Field label={label} help={help}>
      <select
        value={String(value)}
        disabled={disabled}
        onChange={(e) => {
          const raw = (e.target as HTMLSelectElement).value;
          const opt = options.find((o) => String(o.value) === raw);
          if (opt) onChange(opt.value);
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
