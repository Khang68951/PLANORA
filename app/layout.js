import "./globals.css";

export const metadata = {
  title: "Planora — Make space for what matters",
  description: "A calm calendar for tasks, deadlines, and the days ahead.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
