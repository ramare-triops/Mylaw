import type { MylexTool } from '@/types';
import {
  FileEdit,
  FileCode,
  BookOpen,
  Search,
  FileSearch,
  Timeline,
  Clock,
  Timer,
  Mail,
  MessageSquare,
  StickyNote,
  CheckSquare,
  Zap,
} from 'lucide-react';

// Import tool components (lazy-loaded in production)
import dynamic from 'next/dynamic';

const DraftAssistant = dynamic(() =>
  import('@/components/tools/DraftAssistant').then((m) => m.DraftAssistant)
);
const NotesTool = dynamic(() =>
  import('@/components/tools/NotesTool').then((m) => m.NotesTool)
);
const DeadlineTracker = dynamic(() =>
  import('@/components/tools/DeadlineTracker').then((m) => m.DeadlineTracker)
);
const SnippetExpander = dynamic(() =>
  import('@/components/tools/SnippetExpander').then((m) => m.SnippetExpander)
);
const ChecklistTool = dynamic(() =>
  import('@/components/tools/ChecklistTool').then((m) => m.ChecklistTool)
);

export const TOOLS_REGISTRY: MylexTool[] = [
  {
    slug: 'draft-assistant',
    name: 'Assistant de rédaction',
    description: 'Rédaction assistée de documents juridiques avec suggestions IA et variables.',
    icon: FileEdit,
    category: 'writing',
    component: DraftAssistant as MylexTool['component'],
    defaultConfig: {},
    aiCapabilities: ['suggestion-inline', 'reformulation', 'analyse'],
    exportFormats: ['docx', 'pdf', 'html', 'markdown'],
  },
  {
    slug: 'notes',
    name: 'Notes rapides',
    description: 'Prise de notes markdown rattachables à un dossier.',
    icon: StickyNote,
    category: 'organization',
    component: NotesTool as MylexTool['component'],
    defaultConfig: {},
    exportFormats: ['markdown', 'txt'],
  },
  {
    slug: 'deadline-tracker',
    name: 'Suivi des délais',
    description: 'Suivi des délais procéduraux avec alertes et vue calendrier.',
    icon: Clock,
    category: 'time',
    component: DeadlineTracker as MylexTool['component'],
    defaultConfig: {},
  },
  {
    slug: 'snippet-expander',
    name: 'Expansions de texte',
    description: 'Abréviations qui se développent en texte complet.',
    icon: Zap,
    category: 'organization',
    component: SnippetExpander as MylexTool['component'],
    defaultConfig: {},
  },
  {
    slug: 'checklist',
    name: 'Listes de contrôle',
    description: 'Checklists procédurales types et personnalisées.',
    icon: CheckSquare,
    category: 'organization',
    component: ChecklistTool as MylexTool['component'],
    defaultConfig: {},
  },
];

export function getToolBySlug(slug: string): MylexTool | undefined {
  return TOOLS_REGISTRY.find((t) => t.slug === slug);
}
