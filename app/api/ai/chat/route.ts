import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { NextRequest } from 'next/server';
import { z } from 'zod';

const requestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
    })
  ),
  documentContent: z.string().optional(),
  documentMetadata: z.object({
    title: z.string().optional(),
    type: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }).optional(),
  activeTool: z.string().optional(),
  userProfile: z.object({
    name: z.string().optional(),
    cabinet: z.string().optional(),
    specialite: z.string().optional(),
    juridiction: z.string().optional(),
  }).optional(),
  systemPromptExtra: z.string().optional(),
});

const BASE_SYSTEM_PROMPT = `Tu es Mylex, l'assistant personnel d'un avocat français. Tu es intégré dans une application de travail juridique quotidien.

Règles impératives :
- Tu es confidentiel : ne jamais révéler de données personnelles à des tiers.
- Ne jamais inventer de références légales (articles de loi, jurisprudences, décrets). Si tu n'es pas certain d'une référence, indique-le explicitement.
- Réponds en français sauf demande explicite contraire.
- Format de sortie : markdown, avec citations en droit français si pertinent.
- Sois précis, concis et professionnel. Évite les généralités.
- Quand tu génères du contenu à insérer dans un document, formate-le directement (pas de métacommentaire).`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid request', details: parsed.error.flatten() }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { messages, documentContent, documentMetadata, activeTool, userProfile, systemPromptExtra } = parsed.data;

    let systemPrompt = BASE_SYSTEM_PROMPT;

    if (userProfile?.specialite) {
      systemPrompt += `\n\nSpécialité de l'utilisateur : ${userProfile.specialite}.`;
    }
    if (userProfile?.juridiction) {
      systemPrompt += ` Juridictions habituelles : ${userProfile.juridiction}.`;
    }
    if (activeTool) {
      systemPrompt += `\n\nOutil actuellement actif : ${activeTool}.`;
    }
    if (documentMetadata?.title) {
      systemPrompt += `\n\nDocument actif : "${documentMetadata.title}"${documentMetadata.type ? ` (type : ${documentMetadata.type})` : ''}${documentMetadata.tags?.length ? `, tags : ${documentMetadata.tags.join(', ')}` : ''}.`;
    }
    if (documentContent) {
      const truncated = documentContent.length > 8000 ? documentContent.slice(0, 8000) + '\n[... contenu tronqué ...]' : documentContent;
      systemPrompt += `\n\nContenu du document actif :\n\`\`\`\n${truncated}\n\`\`\``;
    }
    if (systemPromptExtra) {
      systemPrompt += `\n\nInstructions personnalisées de l'utilisateur :\n${systemPromptExtra}`;
    }

    const result = await streamText({
      model: openai('gpt-4o'),
      system: systemPrompt,
      messages,
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('[AI Chat Route Error]', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
