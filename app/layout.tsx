import type { Metadata } from "next";
import "./club.css";
import "./garden.css";
import "@designcodeio/threeui/style.css";
import "./sylva.css";
import { GardenBackdrop } from "../components/garden/scene";

export const metadata: Metadata = {
  title: "Nhịp CLB · Họp & lịch trực",
  description:
    "Cùng một nhịp. Quản lý họp tuần, lịch trực C1 và hoạt động thành viên.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased"><GardenBackdrop /><div className="club-interface">{children}</div></body>
    </html>
  );
}
