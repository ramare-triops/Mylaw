import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const exportSchema = z.object({
  content: z.string().min(1),
  title: z.string().default('Document'),
  format: z.enum(['html', 'txt', 'markdown']),
  includeHeader: z.boolean().default(false),
  headerText: z.string().optional(),
  footerText: z.string().optional(),
  replaceUnfilledVars: z.boolean().default(true),
});

// Variable replacement for unfilled {{VARIABLES}}
function replaceUnfilledVariables(content: string, marker = '[À COMPLÉTER]'): string {
  return content.replace(/\{\{[A-Z0-9_]+(?::[^}]+)?\}\}/g, marker);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = exportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid export request', details: parsed.error.flatten() }, { status: 400 });
    }

    let { content, title, format, replaceUnfilledVars, includeHeader, headerText, footerText } = parsed.data;

    if (replaceUnfilledVars) {
      content = replaceUnfilledVariables(content);
    }

    switch (format) {
      case 'txt': {
        // Strip HTML tags for plain text
        const plainText = content
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .trim();
        return new Response(plainText, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(title)}.txt"`,
          },
        });
      }
      case 'markdown': {
        // Basic HTML to Markdown conversion
        let md = content
          .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
          .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
          .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
          .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
          .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
          .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
          .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n\n')
          .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .trim();
        return new Response(md, {
          headers: {
            'Content-Type': 'text/markdown; charset=utf-8',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(title)}.md"`,
          },
        });
      }
      case 'html': {
        const header = includeHeader && headerText ? `<header style="border-bottom:1px solid #ccc;padding-bottom:12px;margin-bottom:24px;">${headerText}</header>` : '';
        const footer = includeHeader && footerText ? `<footer style="border-top:1px solid #ccc;padding-top:12px;margin-top:24px;">${footerText}</footer>` : '';
        const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:Georgia,serif;font-size:12pt;line-height:1.6;max-width:800px;margin:40px auto;padding:0 20px;color:#1a1a1a;}h1,h2,h3{font-family:inherit;}table{border-collapse:collapse;width:100%;}td,th{border:1px solid #ccc;padding:6px 10px;}</style></head><body>${header}<h1>${title}</h1>${content}${footer}</body></html>`;
        return new Response(html, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(title)}.html"`,
          },
        });
      }
      default:
        return NextResponse.json({ error: 'Unsupported format' }, { status: 400 });
    }
  } catch (error) {
    console.error('[Export Route Error]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
