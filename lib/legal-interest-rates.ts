/**
 * Taux de l'intérêt légal — France.
 *
 * Depuis le 1er janvier 2015 (loi du 30 décembre 2014 et décret du
 * 2 octobre 2014), il existe deux taux distincts publiés au Journal
 * Officiel chaque semestre :
 *  - un taux applicable aux créances dues à un PARTICULIER (créancier
 *    personne physique non agissant pour des besoins professionnels) ;
 *  - un taux applicable dans tous les autres cas (créancier
 *    professionnel / personne morale).
 *
 * Source officielle : arrêtés semestriels publiés au JO et repris par
 *  - https://www.banque-france.fr/economie/taux-interet-change-or/le-taux-de-l-interet-legal
 *  - https://www.service-public.fr/professionnels-entreprises/vosdroits/F31298
 *
 * Ce fichier doit être mis à jour à chaque arrêté (en pratique deux
 * fois par an, fin juin / fin décembre). Lorsqu'un calcul couvre une
 * période postérieure au dernier taux connu, l'engine bascule sur le
 * dernier taux disponible et signale l'extrapolation à l'utilisateur.
 */

export type CreditorType = 'particulier' | 'professionnel';
export type Semester = 1 | 2;

export interface LegalRate {
  /** Année concernée (ex. 2024). */
  year: number;
  /** Semestre concerné — 1 = janv→juin, 2 = juil→déc. */
  semester: Semester;
  /** Taux applicable aux créanciers particuliers, en pourcentage annuel. */
  particulier: number;
  /** Taux applicable aux créanciers professionnels / personnes morales. */
  professionnel: number;
}

/**
 * Table historique des taux de l'intérêt légal — à compléter
 * semestriellement. Triée par (year, semester) croissant.
 *
 * NB : conserver la précision officielle (deux décimales pour les
 * années 2015→2022 ; deux décimales depuis aussi).
 */
export const LEGAL_INTEREST_RATES: LegalRate[] = [
  { year: 2015, semester: 1, particulier: 4.06, professionnel: 0.93 },
  { year: 2015, semester: 2, particulier: 4.29, professionnel: 0.99 },
  { year: 2016, semester: 1, particulier: 4.54, professionnel: 1.01 },
  { year: 2016, semester: 2, particulier: 4.35, professionnel: 0.93 },
  { year: 2017, semester: 1, particulier: 4.16, professionnel: 0.90 },
  { year: 2017, semester: 2, particulier: 3.94, professionnel: 0.90 },
  { year: 2018, semester: 1, particulier: 3.73, professionnel: 0.89 },
  { year: 2018, semester: 2, particulier: 3.60, professionnel: 0.88 },
  { year: 2019, semester: 1, particulier: 3.40, professionnel: 0.86 },
  { year: 2019, semester: 2, particulier: 3.26, professionnel: 0.87 },
  { year: 2020, semester: 1, particulier: 3.15, professionnel: 0.87 },
  { year: 2020, semester: 2, particulier: 3.11, professionnel: 0.84 },
  { year: 2021, semester: 1, particulier: 3.14, professionnel: 0.79 },
  { year: 2021, semester: 2, particulier: 3.12, professionnel: 0.76 },
  { year: 2022, semester: 1, particulier: 3.13, professionnel: 0.76 },
  { year: 2022, semester: 2, particulier: 3.15, professionnel: 0.77 },
  { year: 2023, semester: 1, particulier: 4.47, professionnel: 2.06 },
  { year: 2023, semester: 2, particulier: 6.82, professionnel: 4.22 },
  { year: 2024, semester: 1, particulier: 8.01, professionnel: 5.07 },
  { year: 2024, semester: 2, particulier: 8.16, professionnel: 5.26 },
  { year: 2025, semester: 1, particulier: 7.21, professionnel: 4.43 },
];

export function semesterOf(date: Date): Semester {
  return date.getMonth() < 6 ? 1 : 2;
}

export function semesterStart(year: number, semester: Semester): Date {
  return semester === 1 ? new Date(year, 0, 1) : new Date(year, 6, 1);
}

export function semesterEnd(year: number, semester: Semester): Date {
  // Inclus : 30 juin 23h59 ou 31 décembre 23h59. Pour l'arithmétique on
  // travaillera en jours pleins, donc on retourne 30 juin / 31 déc à 0 h.
  return semester === 1 ? new Date(year, 5, 30) : new Date(year, 11, 31);
}

/** Renvoie la durée en jours pleins entre deux dates (inclusive). */
export function daysBetween(from: Date, to: Date): number {
  const ms = stripTime(to).getTime() - stripTime(from).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

export function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

/**
 * Retourne le taux applicable à la `date` selon le profil du créancier.
 * Si la date est postérieure au dernier taux connu, on retombe sur le
 * dernier taux disponible et `extrapolated` vaut true.
 */
export function rateAt(
  date: Date,
  type: CreditorType,
): { rate: number; year: number; semester: Semester; extrapolated: boolean } {
  const y = date.getFullYear();
  const s = semesterOf(date);
  // Recherche exacte
  const exact = LEGAL_INTEREST_RATES.find((r) => r.year === y && r.semester === s);
  if (exact) {
    return { rate: exact[type], year: y, semester: s, extrapolated: false };
  }
  // Sinon, dernier taux connu
  const last = LEGAL_INTEREST_RATES[LEGAL_INTEREST_RATES.length - 1];
  return {
    rate: last[type],
    year: last.year,
    semester: last.semester,
    extrapolated: true,
  };
}

export interface RatePeriodSplit {
  from: Date;
  to: Date;
  year: number;
  semester: Semester;
  days: number;
  rate: number;
  extrapolated: boolean;
}

/**
 * Découpe l'intervalle [from, to] en sous-périodes alignées sur les
 * semestres officiels, en attribuant à chacune le taux correspondant
 * et la fraction d'année (basée sur le nombre de jours de l'année
 * concernée pour respecter les années bissextiles).
 */
export function splitByRatePeriods(
  from: Date,
  to: Date,
  type: CreditorType,
): RatePeriodSplit[] {
  const start = stripTime(from);
  const end = stripTime(to);
  if (end < start) return [];

  const splits: RatePeriodSplit[] = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    const y = cursor.getFullYear();
    const s = semesterOf(cursor);
    const semEnd = semesterEnd(y, s);
    const segmentEnd = end < semEnd ? end : semEnd;
    const info = rateAt(cursor, type);
    splits.push({
      from: new Date(cursor),
      to: new Date(segmentEnd),
      year: y,
      semester: s,
      days: daysBetween(cursor, segmentEnd),
      rate: info.rate,
      extrapolated: info.extrapolated,
    });
    cursor = new Date(segmentEnd);
    cursor.setDate(cursor.getDate() + 1);
  }
  return splits;
}
