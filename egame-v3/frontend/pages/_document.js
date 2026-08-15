import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="bn">
      <Head>
        <link rel="icon" href="/favicon-32.png" sizes="32x32" />
        <link rel="icon" href="/favicon-16.png" sizes="16x16" />
        <link rel="apple-touch-icon" href="/favicon-180.png" />
        <meta name="theme-color" content="#0A0B10" />
        <meta name="description" content="e-Game Marketplace — AI-appraised game accounts, escrow-protected trades, USDT payments." />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
