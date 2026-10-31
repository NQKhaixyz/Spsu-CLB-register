import type { Metadata } from "next";
import "./club.css";

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
      <body className="antialiased">{children}</body>
    </html>
  );
}
