import { createTheme, type MantineColorsTuple } from "@mantine/core";

// Bright, playful accent echoing the in-game mall store signs.
const grape: MantineColorsTuple = [
  "#faf0ff", "#edd9fb", "#d8b1f3", "#c186ec", "#ae63e5",
  "#a24de2", "#9c40e1", "#8832c8", "#7929b3", "#69209d",
];

export const theme = createTheme({
  primaryColor: "grape",
  colors: { grape },
  // Tighter corners read less "bubbly"; borders carry the structure instead.
  defaultRadius: "sm",
  fontFamily:
    "Nunito, Segoe UI, system-ui, -apple-system, sans-serif",
  headings: { fontWeight: "800" },
  cursorType: "pointer",
  components: {
    Card: {
      defaultProps: { withBorder: true, shadow: undefined },
    },
    Paper: {
      defaultProps: { withBorder: true, shadow: undefined },
    },
  },
});
