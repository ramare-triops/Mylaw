/**
 * Moteur de calcul des intérêts au taux légal.
 *
 * Formule appliquée segment par segment :
 *   intérêt = capital × (taux/100) × (jours_segment / jours_année_segment)
 *
 * Le découpage se fait sur les semestres officiels, ce qui évite tout
 * mélange de taux et tient compte des années bissextiles (la division
 * utilise le nombre de jours de l'année courante du segment).
 */
import {
  splitByRatePeriods,
  daysInYear,
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
  /** Intérêts produits sur ce segment. */
  interest: number;
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
  /** capital + intérêts. */
  total: number;
  /** Vrai si au moins un segment utilise un taux extrapolé. */
  extrapolated: boolean;
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
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeOne(
  input: InterestItemInput,
  type: CreditorType,
): ComputedInterestItem {
  const splits = splitByRatePeriods(input.startDate, input.endDate, type);
  const segments: InterestSegment[] = splits.map((s) => {
    const interest = (input.amount * (s.rate / 100) * s.days) / daysInYear(s.year);
    return { ...s, interest: roundCents(interest) };
  });
  const interest = roundCents(segments.reduce((acc, s) => acc + s.interest, 0));
  return {
    itemId: input.id,
    label: input.label,
    amount: roundCents(input.amount),
    startDate: input.startDate,
    endDate: input.endDate,
    segments,
    interest,
    total: roundCents(input.amount + interest),
    extrapolated: segments.some((s) => s.extrapolated),
  };
}

export function computeAll(
  items: InterestItemInput[],
  type: CreditorType,
): InterestComputationResult {
  const computed = items.map((it) => computeOne(it, type));
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
  };
}
