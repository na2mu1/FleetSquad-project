import { Manrope } from 'next/font/google';
import '../styles/globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-main',
  display: 'swap',
});

export default function App({ Component, pageProps }) {
  return (
    <main className={manrope.variable}>
      <Component {...pageProps} />
    </main>
  );
}
