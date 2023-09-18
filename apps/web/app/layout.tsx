import { Metadata } from "next";
import "../styles/globals.css";
import { Inter } from "next/font/google";
import localFont from "next/font/local";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  preload: true,
  display: "swap",
});
const calFont = localFont({
  src: "../styles/CalSans-SemiBold.otf",
  variable: "--font-cal",
  preload: true,
  display: "swap",
});

const title = "Inbox Zero";
const description =
  "The quickest way to inbox zero. Inbox Zero is your virtual assistant for emails.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    creator: "@getinboxzero",
  },
  themeColor: "#FFF",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body
        className={`h-full ${inter.variable} ${calFont.variable} font-sans`}
      >
        {children}
      </body>
    </html>
  );
}
