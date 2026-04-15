import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AppProviders } from '@/components/providers/AppProviders';
import { DriveSyncProvider } from '@/components/providers/DriveSyncProvider';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Mylex — Atelier juridique personnel',
  description: 'Assistant personnel pour avocat : rédaction, documents, IA, délais.',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <AppProviders>
          <DriveSyncProvider>
            {children}
          </DriveSyncProvider>
        </AppProviders>
      </body>
    </html>
  );
}
