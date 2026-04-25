import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TwinMind — Live Suggestions',
  description: 'Live AI suggestions for your meetings.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-bg text-text font-sans">{children}</body>
    </html>
  );
}
