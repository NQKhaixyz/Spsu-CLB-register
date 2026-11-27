import type { Metadata } from "next";
import "./font-faces.css";
import "./club.css";
import "./theme.css";
import "./bulletin-board.css";
import "./screen-cat.css";
import "./music.css";
import "./duty-evidence-and-links.css";
import "./activity-layout.css";
import "./score-ranks.css";
import { ScreenCat } from "../components/screen-cat";
import { SiteUpdateNotice } from "./site-update";

export const metadata: Metadata = {
  title: "Nhịp Đội · Họp & lịch trực",
  description:
    "Cùng một nhịp, quản lý họp tuần, lịch trực C1 và hoạt động thành viên",
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
      <body className="antialiased">
        <div className="club-interface">{children}</div>
        <ScreenCat />
        <SiteUpdateNotice />
      </body>
    </html>
  );
}
