/**
 * GET /api/legal-interest/rates
 *
 * Renvoie la table des taux de l'intérêt légal connus côté serveur.
 * Pour l'instant on se contente de renvoyer la table statique
 * `LEGAL_INTEREST_RATES`. Cette route prépare le terrain pour un futur
 * scraper de la page Banque de France / service-public.fr — il
 * suffira d'enrichir `fetchOfficialRates()` côté serveur, le client
 * n'ayant rien à modifier.
 */
import { NextResponse } from 'next/server';
import { LEGAL_INTEREST_RATES } from '@/lib/legal-interest-rates';

export async function GET() {
  return NextResponse.json({
    rates: LEGAL_INTEREST_RATES,
    source: 'static',
    updatedAt: null,
  });
}
