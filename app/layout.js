import "./globals.css";

export const metadata = {
  title: "Collector Dashboard",
  description: "Masterlist collection dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
