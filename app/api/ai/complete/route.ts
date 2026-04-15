import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const requestSchema = z.object({
  prompt: z.string().min(1),
  context: z.string().optional(),
  instruction: z.enum([
    'reformulate',
    'simplify',
    'formalize',
    'translate_en',
    'translate_fr',
    'expand',
    'summarize',
    'correct',
    'inline',
  ]).optional(),
  model: z.enum(['gpt-4o', 'gpt-4o-mini']).optional().default('gpt-4o-mini'),
});

const INSTRUCTION_PROMPTS: Record<string, string> = {
  reformulate: 'Reformule le texte suivant en conservant exactement le même sens et le même registre juridique. Retourne uniquement le texte reformulé, sans introduction.',
  simplify: 'Simplifie le texte suivant : réduis sa longueur et sa complexité sans perdre le sens juridique essentiel. Retourne uniquement le texte simplifié.',
  formalize: 'Adapte le texte suivant au registre juridique formel français. Retourne uniquement le texte formalisé.',
  translate_en: 'Traduis le texte juridique suivant du français vers l\'anglais (style juridique). Retourne uniquement la traduction.',
  translate_fr: 'Traduis le texte juridique suivant de l\'anglais vers le français (style juridique). Retourne uniquement la traduction.',
  expand: 'Développe et enrichis le texte suivant en ajoutant des arguments juridiques pertinents et des précisions. Retourne uniquement le texte enrichi.',
  summarize: 'Condense le texte suivant en un paragraphe synthétique qui en conserve l\'essentiel juridique. Retourne uniquement le résumé.',
  correct: 'Corrige les fautes d\'orthographe et de grammaire dans le texte suivant sans modifier le fond. Retourne uniquement le texte corrigé.',
  inline: 'Tu es un assistant de rédaction juridique. Exécute l\'instruction suivante :',
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { prompt, context, instruction = 'inline', model } = parsed.data;

    const systemPrompt = INSTRUCTION_PROMPTS[instruction] ?? INSTRUCTION_PROMPTS.inline;
    const userMessage = context
      ? `Contexte du document :\n${context}\n\n---\nTexte à traiter :\n${prompt}`
      : prompt;

    const { text } = await generateText({
      model: openai(model),
      system: `Tu es Mylex, assistant personnel d'un avocat français. ${systemPrompt}`,
      prompt: userMessage,
    });

    return NextResponse.json({ text });
  } catch (error) {
    console.error('[AI Complete Route Error]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
