import { useColorScheme } from "react-native";

const light = {
  bg: "#F4F6F3",
  card: "#FFFFFF",
  text: "#14231C",
  muted: "#6A7A72",
  border: "#E1E7E2",
  primary: "#0F5C45",
  primarySoft: "#E1F0EA",
  onPrimary: "#FFFFFF",
  expense: "#C8453F",
  income: "#1B8A5F",
  savings: "#B9801A",
  warn: "#C77A12",
  danger: "#C8453F",
  input: "#F4F6F3",
  overlay: "rgba(0,0,0,0.4)",
};
const dark: typeof light = {
  bg: "#0D1512",
  card: "#16211C",
  text: "#EAF2ED",
  muted: "#8FA196",
  border: "#25332C",
  primary: "#3DBA8C",
  primarySoft: "#1B3029",
  onPrimary: "#08150F",
  expense: "#F0726B",
  income: "#4CC796",
  savings: "#E8B24A",
  warn: "#E8A33D",
  danger: "#F0726B",
  input: "#0F1915",
  overlay: "rgba(0,0,0,0.6)",
};

export type Palette = typeof light;
export const useTheme = (): Palette => (useColorScheme() === "dark" ? dark : light);

export const CHART_COLORS = ["#0F9D76", "#E8A33D", "#4C7BE0", "#D9577A", "#8B6FD1", "#35B0C4", "#C98B1B", "#7A8F5A", "#E0704A", "#6A7A72"];

export const radius = { sm: 10, md: 14, lg: 20 };
