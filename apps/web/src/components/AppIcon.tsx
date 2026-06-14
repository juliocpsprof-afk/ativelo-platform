export type IconName =
  | "dashboard"
  | "assets"
  | "catalog"
  | "tickets"
  | "maintenance"
  | "loans"
  | "locations"
  | "audits"
  | "network"
  | "reports"
  | "bell"
  | "plus"
  | "scan"
  | "tag"
  | "history"
  | "database"
  | "chevron"
  | "search"
  | "filter"
  | "edit"
  | "close"
  | "save"
  | "refresh"
  | "serial"
  | "user"
  | "building"
  | "camera"
  | "image"
  | "print"
  | "trash"
  | "star"
  | "calendar"
  | "alert"
  | "chart"
  | "check"
  | "book"
  | "message"
  | "clock"
  | "send"
  | "clipboard"
  | "mail"
  | "phone"
  | "settings"
  | "return"
  | "transfer"
  | "activity"
  | "copy"
  | "download"
  | "link"
  | "cpu"
  | "wifi"
  | "server"
  | "key";

type AppIconProps = {
  name: IconName;
  size?: number;
  strokeWidth?: number;
};

export default function AppIcon({
  name,
  size = 22,
  strokeWidth = 1.9,
}: AppIconProps) {
  const commonProps = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "dashboard":
      return <svg {...commonProps}><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>;
    case "assets":
      return <svg {...commonProps}><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></svg>;
    case "catalog":
      return <svg {...commonProps}><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></svg>;
    case "tickets":
      return <svg {...commonProps}><path d="M4 5h16v5a2 2 0 0 0 0 4v5H4v-5a2 2 0 0 0 0-4z"/><path d="M12 7v2M12 12v1M12 16v1"/></svg>;
    case "maintenance":
      return <svg {...commonProps}><path d="M14.7 6.3a4 4 0 0 0-5 5L4 17l3 3 5.7-5.7a4 4 0 0 0 5-5l-2.5 2.5-3-3z"/></svg>;
    case "loans":
      return <svg {...commonProps}><path d="M7 7h11M15 4l3 3-3 3M17 17H6M9 14l-3 3 3 3"/></svg>;
    case "locations":
      return <svg {...commonProps}><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>;
    case "audits":
      return <svg {...commonProps}><path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6z"/><path d="m9 12 2 2 4-4"/></svg>;
    case "network":
      return <svg {...commonProps}><circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="m10.8 7.2-4.4 8.3M13.2 7.2l4.4 8.3M7.5 18h9"/></svg>;
    case "reports":
      return <svg {...commonProps}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>;
    case "bell":
      return <svg {...commonProps}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7"/><path d="M10 19h4"/></svg>;
    case "plus":
      return <svg {...commonProps}><path d="M12 5v14M5 12h14"/></svg>;
    case "scan":
      return <svg {...commonProps}><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><rect x="8" y="8" width="3" height="3"/><rect x="13" y="8" width="3" height="3"/><rect x="8" y="13" width="3" height="3"/><path d="M14 14h2v2h-2z"/></svg>;
    case "tag":
      return <svg {...commonProps}><path d="M20 13 13 20 4 11V4h7z"/><circle cx="8.5" cy="8.5" r="1.2"/></svg>;
    case "history":
      return <svg {...commonProps}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></svg>;
    case "database":
      return <svg {...commonProps}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>;
    case "chevron":
      return <svg {...commonProps}><path d="m9 18 6-6-6-6"/></svg>;
    case "search":
      return <svg {...commonProps}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
    case "filter":
      return <svg {...commonProps}><path d="M4 5h16M7 12h10M10 19h4"/></svg>;
    case "edit":
      return <svg {...commonProps}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/></svg>;
    case "close":
      return <svg {...commonProps}><path d="M6 6l12 12M18 6 6 18"/></svg>;
    case "save":
      return <svg {...commonProps}><path d="M5 3h12l2 2v16H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></svg>;
    case "refresh":
      return <svg {...commonProps}><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>;
    case "serial":
      return <svg {...commonProps}><path d="M4 6h16v12H4z"/><path d="M7 9v6M10 9v6M14 9v6M17 9v6"/></svg>;
    case "user":
      return <svg {...commonProps}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>;
    case "building":
      return <svg {...commonProps}><path d="M4 21V5l8-3v19M12 8h8v13M7 8h1M7 12h1M7 16h1M15 11h1M15 15h1M15 19h1"/></svg>;
    case "camera":
      return <svg {...commonProps}><path d="M5 7h3l1.5-2h5L16 7h3a2 2 0 0 1 2 2v9H3V9a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="3.5"/></svg>;
    case "image":
      return <svg {...commonProps}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/></svg>;
    case "print":
      return <svg {...commonProps}><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/></svg>;
    case "trash":
      return <svg {...commonProps}><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></svg>;
    case "star":
      return <svg {...commonProps}><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>;
    case "calendar":
      return <svg {...commonProps}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>;
    case "alert":
      return <svg {...commonProps}><path d="M12 3 2.5 20h19z"/><path d="M12 9v5M12 17h.01"/></svg>;
    case "chart":
      return <svg {...commonProps}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>;
    case "check":
      return <svg {...commonProps}><path d="m5 12 4 4L19 6"/></svg>;
    case "book":
      return <svg {...commonProps}><path d="M4 5a3 3 0 0 1 3-3h5v18H7a3 3 0 0 0-3 3z"/><path d="M20 5a3 3 0 0 0-3-3h-5v18h5a3 3 0 0 1 3 3z"/></svg>;
    case "message":
      return <svg {...commonProps}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/></svg>;
    case "clock":
      return <svg {...commonProps}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case "send":
      return <svg {...commonProps}><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>;

    case "mail":
      return <svg {...commonProps}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>;
    case "phone":
      return <svg {...commonProps}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z"/></svg>;
    case "settings":
      return <svg {...commonProps}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3.1V3h4v.1A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9A1.7 1.7 0 0 0 20.9 10h.1v4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>;
    case "return":
      return <svg {...commonProps}><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v5"/></svg>;
    case "transfer":
      return <svg {...commonProps}><path d="M7 7h11M15 4l3 3-3 3M17 17H6M9 14l-3 3 3 3"/></svg>;


    case "activity":
      return <svg {...commonProps}><path d="M3 12h4l2-6 4 12 2-6h6"/></svg>;
    case "copy":
      return <svg {...commonProps}><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/></svg>;
    case "download":
      return <svg {...commonProps}><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>;
    case "link":
      return <svg {...commonProps}><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>;
    case "cpu":
      return <svg {...commonProps}><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></svg>;
    case "wifi":
      return <svg {...commonProps}><path d="M5 12.5a11 11 0 0 1 14 0M8.5 16a6 6 0 0 1 7 0M12 20h.01M2 9a16 16 0 0 1 20 0"/></svg>;
    case "server":
      return <svg {...commonProps}><rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6"/></svg>;
    case "key":
      return <svg {...commonProps}><circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M15 8l2 2M17 6l2 2"/></svg>;

    case "clipboard":
      return <svg {...commonProps}><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h4"/></svg>;
  }
}
