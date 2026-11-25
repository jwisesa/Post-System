import { Barlow, JetBrains_Mono } from "next/font/google";

export const chartText = Barlow({ subsets: ["latin"], weight: ["400", "600"], display: "swap", variable: "--fc-text" });
export const chartMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "600"], display: "swap", variable: "--fc-mono" });
export const chartFonts = { text: chartText.style.fontFamily, mono: chartMono.style.fontFamily };
export const fontVars = `${chartText.variable} ${chartMono.variable}`;
