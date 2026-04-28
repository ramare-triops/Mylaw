/**
 * Moteur de calcul des intérêts au taux légal.
 *
 * Formule appliquée segment par segment :
 *   intérêt = capital × (taux/100) × (jours_segment / jours_année_segment)
 *
 * Le découpage se fait sur les semestres officiels, ce qui évite tout
 * mélange de taux et tient compte des années bissextiles (la division
 * utilise le nombre de jours de l'année courante du segment).
 *
 * Capitalisation des intérêts (anatocisme — art. 1343-2 du Code civil) :
 * lorsqu'une décision de justice l'ordonne, on indique la date de
 * départ de la capitalisation. À chaque anniversaire de cette date
 * (c'est-à-dire dès qu'une année entière d'intérêts est échue), les
 * intérêts cumulés sur l'année écoulée sont ajoutés au capital et
 * produisent eux-mêmes intérêt sur l'année suivante. Avant la date
 * de départ et pour les fractions d'année incomplètes, le calcul
 * reste en intérêts simples.
 */
import {
  splitByRatePeriods,
  daysInYear,
  stripTime,
  type CreditorType,
  type RatePeriodSplit,
} from '@/lib/legal-interest-rates';

export interface InterestItemInput {
  /** Identifiant local stable (uuid). */
  id: string;
  /** Libellé court (ex. « Jugement », « Solde provisoire »). */
  label: string;
  /** Capital de référence en euros. */
  amount: number;
  /** Date de départ des intérêts (incluse). */
  startDate: Date;
  /** Date de fin (incluse). */
  endDate: Date;
}

export interface InterestSegment extends RatePeriodSplit {
  /** Capital effectif servant de base au calcul du segment (peut
   *  augmenter d'une année sur l'autre lorsqu'il y a capitalisation). */
  capital: number;
  /** Intérêts produits sur ce segment. */
  interest: number;
  /** Vrai si l'année de capitalisation se termine sur ce segment. */
  capitalizedAfter?: boolean;
}

export interface ComputedInterestItem {
  itemId: string;
  label: string;
  amount: number;
  startDate: Date;
  endDate: Date;
  segments: InterestSegment[];
  /** Somme des intérêts de tous les segments. */
  interest: number;
  /** capital de départ + intérêts. */
  total: number;
  /** Vrai si au moins un segment utilise un taux extrapolé. */
  extrapolated: boolean;
  /** Vrai si la capitalisation a effectivement été appliquée
   *  au moins une fois sur cet item. */
  capitalized?: boolean;
}

export interface ComputeOptions {
  /** Active la capitalisation annuelle (anatocisme). */
  capitalize?: boolean;
  /**
   * Date à compter de laquelle la capitalisation est ordonnée. À
   * chaque anniversaire de cette date inclus dans la période, les
   * intérêts de l'année écoulée sont ajoutés au capital.
   */
  capitalizationStartDate?: Date;
}

export interface InterestComputationResult {
  creditorType: CreditorType;
  computedAt: Date;
  items: ComputedInterestItem[];
  totalCapital: number;
  totalInterest: number;
  totalAmount: number;
  /** Vrai si l'un des items a utilisé un taux extrapolé. */
  hasExtrapolation: boolean;
  /** Vrai si la capitalisation est activée et a effectivement été
   *  appliquée sur au moins un item. */
  capitalize?: boolean;
  capitalizationStartDate?: Date;
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

function addYears(d: Date, years: number): Date {
  return new Date(d.getFullYear() + years, d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + days);
  return nd;
}

/** Calcul intérêts simples sur [from, to] avec un capital constant. */
function computeRange(
  capital: number,
  from: Date,
  to: Date,
  type: CreditorType,
): InterestSegment[] {
  if (to < from) return [];
  const splits = splitByRatePeriods(from, to, type);
  return splits.map((s) => {
    const interest = (capital * (s.rate / 100) * s.days) / daysInYear(s.year);
    return { ...s, capital, interest: roundCents(interest) };
  });
}

export function computeOne(
  input: InterestItemInput,
  type: CreditorType,
  options: ComputeOptions = {},
): ComputedInterestItem {
  const start = stripTime(input.startDate);
  const end = stripTime(input.endDate);
  const segments: InterestSegment[] = [];
  let totalInterest = 0;
  let capitalized = false;

  const useCap =
    options.capitalize === true && options.capitalizationStartDate != null;
  const capStart = useCap
    ? stripTime(options.capitalizationStartDate as Date)
    : null;

  if (!useCap || !capStart || capStart > end) {
    // ─── Intérêts simples sur toute la période ─────────────────────
    const phase = useCap && capStart ? capStart : addDays(end, 1); // capStart hors période → tout en simple
    const simpleEnd = useCap && capStart ? addDays(capStart, -1) : end;
    const upTo = simpleEnd < end ? simpleEnd : end;
    const segs = computeRange(input.amount, start, upTo, type);
    segments.push(...segs);
    totalInterest = segs.reduce((acc, s) => acc + s.interest, 0);
    void phase;
  } else {
    // ─── Phase 1 : intérêts simples de start → capStart - 1 jour ─
    let runningCapital = input.amount;
    if (capStart > start) {
      const phase1End = addDays(capStart, -1);
      const phase1 = computeRange(runningCapital, start, phase1End, type);
      segments.push(...phase1);
      totalInterest += phase1.reduce((acc, s) => acc + s.interest, 0);
    }

    // ─── Phase 2 : capitalisation annuelle de capStart → end ─────
    let cursor = capStart > start ? capStart : start;
    let anniversary = addYears(cursor, 1);
    let safety = 200; // garde-fou, 200 ans max
    while (cursor <= end && safety-- > 0) {
      const periodEnd = anniversary > end ? end : addDays(anniversary, -1);
      const segs = computeRange(runningCapital, cursor, periodEnd, type);
      const yearInterest = segs.reduce((acc, s) => acc + s.interest, 0);
      segments.push(...segs);
      totalInterest += yearInterest;

      if (anniversary <= end) {
        // Année entière échue → capitalisation
        runningCapital = roundCents(runningCapital + yearInterest);
        if (segments.length > 0) {
          segments[segments.length - 1].capitalizedAfter = true;
        }
        capitalized = true;
        cursor = anniversary;
        anniversary = addYears(anniversary, 1);
      } else {
        // Fraction d'année restante → pas de capitalisation
        break;
      }
    }
  }

  totalInterest = roundCents(totalInterest);
  return {
    itemId: input.id,
    label: input.label,
    amount: roundCents(input.amount),
    startDate: input.startDate,
    endDate: input.endDate,
    segments,
    interest: totalInterest,
    total: roundCents(input.amount + totalInterest),
    extrapolated: segments.some((s) => s.extrapolated),
    capitalized,
  };
}

export function computeAll(
  items: InterestItemInput[],
  type: CreditorType,
  options: ComputeOptions = {},
): InterestComputationResult {
  const computed = items.map((it) => computeOne(it, type, options));
  const totalCapital = roundCents(computed.reduce((acc, c) => acc + c.amount, 0));
  const totalInterest = roundCents(computed.reduce((acc, c) => acc + c.interest, 0));
  return {
    creditorType: type,
    computedAt: new Date(),
    items: computed,
    totalCapital,
    totalInterest,
    totalAmount: roundCents(totalCapital + totalInterest),
    hasExtrapolation: computed.some((c) => c.extrapolated),
    capitalize: options.capitalize === true,
    capitalizationStartDate: options.capitalizationStartDate,
  };
}
