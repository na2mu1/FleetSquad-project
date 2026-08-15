import { useRouter } from 'next/router';
import Link from 'next/link';
export default function PaymentSuccess() {
  const { query } = useRouter();
  return (
    <div className="p">
      <div className="s">✓</div>
      <h1>Payment Successful!</h1>
      <p>আপনার wallet balance update হয়েছে।</p>
      <Link href="/deposit">← Wallet দেখুন</Link>
      <style jsx>{`
        .p{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#F4F1EA;font-family:system-ui;gap:12px;background:#05060a;}
        .s{width:64px;height:64px;border-radius:50%;background:rgba(32,209,121,.15);color:#20D179;font-size:32px;display:flex;align-items:center;justify-content:center;}
        h1{margin:0;font-size:22px;}p{color:#9C9FB0;margin:0;}a{color:#FF7A1A;}
      `}</style>
    </div>
  );
}
