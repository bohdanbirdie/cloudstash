const WORD_BOUNDARY = /[\s@._-]/;

export function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (q.length === 0) return 0;

  let score = 0;
  let qi = 0;
  let prevMatch = -2;
  let streak = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue;

    let bonus = 1;
    if (prevMatch === ti - 1) {
      streak += 1;
      bonus += streak * 4;
    } else {
      streak = 0;
    }
    if (ti === 0 || WORD_BOUNDARY.test(t[ti - 1])) bonus += 10;

    score += bonus;
    prevMatch = ti;
    qi += 1;
  }

  if (qi < q.length) return null;
  return score - t.length * 0.1;
}

export function bestFuzzyScore(
  query: string,
  targets: ReadonlyArray<string | null | undefined>
): number | null {
  let best: number | null = null;
  for (const target of targets) {
    if (!target) continue;
    const score = fuzzyScore(query, target);
    if (score !== null && (best === null || score > best)) best = score;
  }
  return best;
}
