import type { Metadata } from "next";
import CreditIssuerConsole from "./issuer-console";
import "./credit-issuer.css";

export const metadata: Metadata = {
  title: "Vua Cờ Bạc · Nhịp Đội",
  robots: { index: false, follow: false },
};

export default function CreditIssuerPage() {
  return <CreditIssuerConsole />;
}
