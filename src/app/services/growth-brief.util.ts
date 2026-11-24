import type { AudienceTrend, MonthOverMonthGrowth } from './marketing.service';

/**
 * The prompt-side twin of the Strategy growth card.
 *
 * Strategy refuses to print a percentage from one recorded month, a percentage
 * against a zero baseline, a comparison across a skipped month, or a new
 * platform folded into growth. The model gets the same record under the same
 * rules, so "how am I doing?" is answered from the artist's own weekly entries
 * instead of a plausible-sounding number.
 */

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const GROUPED = new Intl.NumberFormat('en-US');

/** Returned instead of the record when the artist withholds profile answers. */
export const GROWTH_WITHHELD =
  'ARTIST GROWTH RECORD — withheld (the artist has not shared business or audience data with AI). Do not state, estimate or infer any follower count, listener count, growth percentage or platform trend, and ask before using audience figures.';

/** `2026-08` → `Aug 2026`, matching the Strategy card's point labels. */
export function growthMonthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const index = Number(match[2]) - 1;
  return index >= 0 && index < 12 ? `${MONTH_NAMES[index]} ${match[1]}` : month;
}

/** A run of skipped months, repeating the year only when it changes. */
export function growthGapLabel(months: readonly string[]): string {
  if (!months.length) return '';
  const first = months[0];
  const last = months[months.length - 1];
  if (first === last) return growthMonthLabel(first);
  return first.slice(0, 4) === last.slice(0, 4)
    ? `${MONTH_NAMES[Number(first.slice(5, 7)) - 1]}–${growthMonthLabel(last)}`
    : `${growthMonthLabel(first)}–${growthMonthLabel(last)}`;
}

/**
 * Appended when the prompt budget forces recorded lines out of the block.
 *
 * Without it the surviving lines read as the whole record: a model that sees
 * two platforms and no note about the rest answers "your growth is three
 * platforms" with full confidence. The note costs one line and makes the cut
 * itself part of the evidence.
 */
export const GROWTH_TRUNCATED_NOTE =
  '[GROWTH RECORD CUT SHORT — more recorded platforms or months exist than fit in this block. Say so when the answer depends on them; never treat the lines above as the whole record.]';

/**
 * Trims a brief to the prompt budget without splitting a line.
 *
 * A hard character cut lands inside a platform row, and the model then reads a
 * figure with no month attached to it — the exact shape of a fabricated number.
 * Cutting at the last newline keeps every surviving line whole, and the
 * truncation note rides along inside the same budget so a cut block announces
 * itself. A limit too narrow for the note returns nothing at all: half a record
 * with no warning is worse than no record.
 */
export function trimGrowthBrief(text: string, limit: number): string {
  if (limit <= 0) return '';
  if (text.length <= limit) return text;
  const note = `\n${GROWTH_TRUNCATED_NOTE}`;
  if (limit <= note.length) return '';
  const cut = text.slice(0, limit - note.length);
  const lastBreak = cut.lastIndexOf('\n');
  const body = (lastBreak > 0 ? cut.slice(0, lastBreak) : cut).trimEnd();
  return body ? `${body}${note}` : GROWTH_TRUNCATED_NOTE;
}

const signed = (value: number): string =>
  `${value > 0 ? '+' : ''}${GROUPED.format(value)}`;

const totalLine = (label: string, trend: AudienceTrend | null): string => {
  if (!trend) {
    return `${label}: no comparable total — nothing was recorded in both calendar months.`;
  }
  const percent =
    trend.percent === null
      ? 'no percentage, because the previous total was zero'
      : `${signed(trend.percent)}%`;
  return `${label}: ${GROUPED.format(trend.previous)} → ${GROUPED.format(
    trend.latest
  )} (${signed(trend.delta)}, ${percent}) across ${trend.platforms} platform${
    trend.platforms === 1 ? '' : 's'
  } recorded in both months.`;
};

/**
 * Compact, bounded brief for the model prompt.
 *
 * The rules sit above the data on purpose and are kept short: callers trim the
 * tail of a long brief to fit the prompt budget, and a trim must cost figures
 * before it can cost the rules that bind them.
 */
export function buildGrowthBrief(growth: MonthOverMonthGrowth): string {
  const latest = growth.latestMonth
    ? growthMonthLabel(growth.latestMonth)
    : null;
  const previous = growth.previousMonth
    ? growthMonthLabel(growth.previousMonth)
    : null;

  const lines: string[] = [
    'ARTIST GROWTH RECORD — platform figures the artist recorded by hand, one entry per week. This is the only audience evidence S.M.U.V.E. has: not a platform export, and a month with no entry is missing, not zero.',
    'BINDING GROWTH RULES (the Strategy card enforces these): quote only these figures — never invent, estimate, annualise, forecast or convert them to revenue. A skipped month is missing data, never zero, and a move spanning one is not a month-over-month change; name the missing months. One recorded month gives no direction and no percentage. Totals compare only platforms recorded in both months; a new platform is not growth. If the record cannot answer, say what is missing and what to record next.',
  ];

  if (growth.state === 'no-data' || !latest) {
    lines.push(
      'RECORDED FIGURES: none yet. Do not supply a placeholder, a range or an industry average — ask the artist to record this week for one platform instead.'
    );
    return lines.join('\n');
  }

  lines.push(
    `LATEST RECORDED MONTH: ${latest}${
      previous ? ` | COMPARED WITH THE CALENDAR MONTH BEFORE: ${previous}` : ''
    }.`
  );

  if (growth.state === 'comparable') {
    lines.push(totalLine('FOLLOWERS', growth.followers));
    lines.push(totalLine('MONTHLY LISTENERS', growth.monthlyListeners));
  } else if (growth.state === 'no-baseline') {
    lines.push(
      `NO MONTH-OVER-MONTH TOTAL: nothing was recorded in ${
        previous ?? 'the previous calendar month'
      }, so ${latest} has no baseline. One recorded month is a figure, not growth, and no percentage can be computed from it.`
    );
  } else {
    lines.push(
      `NO MONTH-OVER-MONTH TOTAL: ${
        previous ?? 'the previous month'
      } and ${latest} have figures, but no platform appears in both, so no total compares them.`
    );
  }

  growth.trends.slice(0, 5).forEach((trend) => {
    const points = trend.points
      .map((point) => {
        const skipped = point.gapBefore?.length
          ? `[no data for ${growthGapLabel(point.gapBefore)}] → `
          : '';
        return `${skipped}${growthMonthLabel(point.month)} ${GROUPED.format(
          point.value
        )}`;
      })
      .join(' → ');
    lines.push(
      `- ${trend.platform}: ${points} (${signed(
        trend.delta
      )} across the months it was actually recorded).`
    );
  });
  if (growth.trends.length > 5) {
    lines.push(
      `(+${growth.trends.length - 5} more platform${
        growth.trends.length - 5 === 1 ? '' : 's'
      } with recorded direction — do not guess their figures; ask which one to read.)`
    );
  }

  if (growth.recordedOnce.length) {
    lines.push(
      `RECORDED IN ONE MONTH ONLY (no direction, and not growth): ${growth.recordedOnce
        .map((entry) => `${entry.platform} (${growthMonthLabel(entry.month)})`)
        .join(', ')}.`
    );
  }
  if (growth.newPlatforms.length) {
    lines.push(
      `FIRST RECORDED IN ${latest} — a new platform is not growth: ${growth.newPlatforms.join(
        ', '
      )}.`
    );
  }

  return lines.join('\n');
}
