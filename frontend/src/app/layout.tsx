import "./globals.css";

export const metadata = {
  title: "AWS Admin Dashboard",
  description: "Demo control panel for API Gateway + Lambda + RDS + S3",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
