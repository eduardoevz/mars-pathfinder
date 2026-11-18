import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "MARS PATHFINDER | Intelligent Planetary Exploration & EVA Mission System",
  description:
    "Interactive 3D Google Earth Mars Globe + QGIS/GDAL Planetary GIS + Multi-Criteria A* EVA Safety, PLSS O2 & Astronaut Field HUD (NASA Space Apps Challenge 2026).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <body className={`${inter.className} ${jetbrainsMono.variable} bg-[#07090E] text-slate-100 antialiased`}>
        {children}
      </body>
    </html>
  );
}
