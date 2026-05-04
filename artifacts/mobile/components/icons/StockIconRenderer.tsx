// StockIconRenderer maps Feather icon name strings to StockIcons components.
// Use this anywhere an icon name is stored as a string in a data object,
// map, or prop. For static literal names at the call site, prefer importing
// the specific component directly from ./StockIcons.

import React from "react";
import * as Icons from "./StockIcons";

interface Props {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  // Navigation
  "home": Icons.HomeIcon,
  "search": Icons.SearchIcon,
  "book-open": Icons.DigestIcon,
  "pie-chart": Icons.InsightsIcon,
  "bar-chart-2": Icons.InsightsIcon,
  "briefcase": Icons.PortfolioIcon,
  "bell": Icons.AlertIcon,
  "bell-off": Icons.BellOffIcon,
  "user": Icons.AccountIcon,
  "shield": Icons.AdminIcon,

  // Actions
  "plus": Icons.AddIcon,
  "x": Icons.CloseIcon,
  "x-circle": Icons.XCircleIcon,
  "x-octagon": Icons.XOctagonIcon,
  "trash-2": Icons.DeleteIcon,
  "edit-2": Icons.EditIcon,
  "download": Icons.ExportIcon,
  "send": Icons.SendIcon,
  "refresh-cw": Icons.RefreshIcon,
  "refresh-ccw": Icons.RefreshCcwIcon,
  "shuffle": Icons.ShuffleIcon,
  "external-link": Icons.ExternalLinkIcon,
  "sliders": Icons.FilterIcon,
  "settings": Icons.SettingsIcon,
  "maximize-2": Icons.MaximizeIcon,

  // Chevrons & arrows
  "chevron-right": Icons.ChevronRightIcon,
  "chevron-left": Icons.ChevronLeftIcon,
  "chevron-down": Icons.ExpandIcon,
  "chevron-up": Icons.CollapseIcon,
  "arrow-left": Icons.ArrowLeftIcon,
  "arrow-right": Icons.ArrowRightIcon,

  // Status & feedback
  "check": Icons.CheckIcon,
  "check-circle": Icons.CheckCircleIcon,
  "alert-triangle": Icons.AlertTriangleIcon,
  "alert-circle": Icons.AlertCircleIcon,
  "info": Icons.InfoIcon,
  "slash": Icons.SlashIcon,
  "lock": Icons.LockIcon,
  "zap": Icons.ZapIcon,
  "zap-off": Icons.ZapOffIcon,

  // Data & content
  "trending-up": Icons.TrendUpIcon,
  "trending-down": Icons.TrendDownIcon,
  "activity": Icons.ActivityIcon,
  "star": Icons.StarIcon,
  "file-text": Icons.FileTextIcon,
  "bookmark": Icons.BookmarkIcon,
  "clock": Icons.ClockIcon,
  "calendar": Icons.CalendarIcon,
  "layers": Icons.LayersIcon,
  "grid": Icons.GridIcon,
  "columns": Icons.ColumnsIcon,
  "list": Icons.ListIcon,
  "minus": Icons.MinusIcon,
  "printer": Icons.PrinterIcon,

  // Communication
  "mail": Icons.MailIcon,
  "message-square": Icons.MessageSquareIcon,
  "at-sign": Icons.AtSignIcon,
  "rss": Icons.RssIcon,
  "inbox": Icons.InboxIcon,

  // Identity & financial
  "globe": Icons.GlobeIcon,
  "life-buoy": Icons.LifeBuoyIcon,
  "cpu": Icons.CpuIcon,
  "credit-card": Icons.CreditCardIcon,
  "gift": Icons.GiftIcon,
  "folder": Icons.FolderIcon,
  "folder-minus": Icons.FolderMinusIcon,
  "git-branch": Icons.GitBranchIcon,

  // Visibility
  "eye": Icons.EyeIcon,
  "eye-off": Icons.EyeOffIcon,

  // Connectivity
  "wifi-off": Icons.WifiOffIcon,

  // Theme
  "sun": Icons.SunIcon,
  "moon": Icons.MoonIcon,

  // Playback
  "pause": Icons.PauseIcon,
  "play": Icons.PlayIcon,

  // Misc
  "more-horizontal": Icons.MoreHorizontalIcon,

  // Sharing & loading
  "share-2": Icons.Share2Icon,
  "loader": Icons.LoaderIcon,

  // Geometry
  "circle": Icons.CircleIcon,
};

export function StockIconRenderer({ name, size = 20, color = "#000000", strokeWidth }: Props) {
  const IconComponent = ICON_MAP[name];
  if (!IconComponent) {
    if (__DEV__) {
      console.warn(`StockIconRenderer: no mapping found for Feather icon "${name}"`);
    }
    return <Icons.MinusIcon size={size} color="transparent" />;
  }
  return <IconComponent size={size} color={color} strokeWidth={strokeWidth} />;
}
