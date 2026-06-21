// Auto-generated defaults — regenerate by running the "Save current as defaults" action.
// Keep in sync with the Prisma schema defaults for SystemSettings.

const DEFAULT_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 120" width="440" height="120">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;800&amp;display=swap');
      .wordmark { font-family: 'Montserrat', Arial, sans-serif; font-weight: 800; }
      .sub { font-family: 'Montserrat', Arial, sans-serif; font-weight: 400; }
    </style>
  </defs>
  <rect x="24" y="18" width="32" height="70" rx="8" fill="#F7F3EC"/>
  <rect x="64" y="18" width="32" height="70" rx="8" fill="#F7F3EC"/>
  <rect x="24" y="93" width="72" height="4" rx="2" fill="#52796F"/>
  <text x="118" y="70" class="wordmark" font-size="52" fill="#F7F3EC" letter-spacing="-1">PARITY</text>
  <text x="120" y="94" class="sub" font-size="16" fill="#52796F" letter-spacing="10">CRM</text>
</svg>`;

export const DEFAULT_LOGO_DATA_URL = `data:image/svg+xml;base64,${typeof btoa !== "undefined" ? btoa(DEFAULT_LOGO_SVG) : Buffer.from(DEFAULT_LOGO_SVG).toString("base64")}`;

export const DEFAULT_BRANDING = {
  orgName: "Parity CRM",
  primaryColour: "#C9A84C",
  sidebarColour: "#1b3a2d",
  sidebarTextColour: "#f7f3ec",
  logoUrl: DEFAULT_LOGO_DATA_URL,
} as const;
