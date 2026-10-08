import type { FilterPolicy, FilterRule } from './types';

/**
 * Avalia uma filter policy do SNS sobre os atributos da mensagem.
 * Todas as chaves precisam casar (E); dentro de uma chave, qualquer regra casa (OU).
 */
export function matchesFilterPolicy(
  policy: FilterPolicy | null | undefined,
  attributes: Record<string, string>,
): boolean {
  if (!policy) return true;
  for (const [key, rules] of Object.entries(policy)) {
    if (rules.length === 0) continue;
    const value = attributes[key];
    if (!rules.some((rule) => matchesRule(rule, value))) return false;
  }
  return true;
}

function matchesRule(rule: FilterRule, value: string | undefined): boolean {
  if (typeof rule === 'string') return value === rule;
  if ('exists' in rule) return rule.exists ? value !== undefined : value === undefined;
  // anything-but não casa quando o atributo está ausente
  return value !== undefined && !rule['anything-but'].includes(value);
}

/** Texto curto para exibir a policy. */
export function describeFilterPolicy(policy: FilterPolicy | null | undefined): string {
  if (!policy || Object.keys(policy).length === 0) return 'sem filtro';
  return Object.entries(policy)
    .map(([key, rules]) => {
      const parts = rules.map((r) => {
        if (typeof r === 'string') return r;
        if ('exists' in r) return r.exists ? 'existe' : 'não existe';
        return `qualquer exceto ${r['anything-but'].join('/')}`;
      });
      return `${key} = ${parts.join(' ou ')}`;
    })
    .join(' e ');
}
