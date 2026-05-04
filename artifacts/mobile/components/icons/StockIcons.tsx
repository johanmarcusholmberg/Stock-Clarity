// Custom StockClarity icon set — built from react-native-svg primitives so
// the same source renders on iOS, Android, and web. Phase 1 usage is
// web-only; native screens still use Feather. See README in this folder.

import React from "react";
import Svg, { Path, Line, Circle, Polyline, Rect, G, Polygon } from "react-native-svg";

interface IconProps {
  size?: number;
  color?: string;
}

const stroke = (color: string, width = 1.5) => ({
  stroke: color,
  strokeWidth: width,
  fill: "none" as const,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

// ─── Navigation icons ────────────────────────────────────────────────────────

export const HomeIcon = ({ size = 20, color = "#000000" }: IconProps) => (
  // Minimal house outline. Roof: two lines meeting at a peak.
  // Walls: a rectangle. Door replaced by a small upward-trending line.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polyline points="3,12 12,4 21,12" {...stroke(color)} />
    <Polyline points="5,11 5,20 19,20 19,11" {...stroke(color)} />
    <Polyline points="10,18 12,15 14,16 16,13" {...stroke(color, 1.6)} />
  </Svg>
);

export const DigestIcon = ({ size = 20, color = "#000000" }: IconProps) => (
  // Three horizontal lines of decreasing width with a live "pulse" dot
  // at the right end of the top line.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Line x1={4} y1={7} x2={18} y2={7} {...stroke(color)} />
    <Line x1={4} y1={12} x2={15} y2={12} {...stroke(color)} />
    <Line x1={4} y1={17} x2={11} y2={17} {...stroke(color)} />
    <Circle cx={20.2} cy={7} r={1.6} fill={color} />
  </Svg>
);

export const SearchIcon = ({ size = 20, color = "#000000" }: IconProps) => (
  // Magnifier circle with two tiny candlestick bars inside.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={10} cy={10} r={6.5} {...stroke(color)} />
    <Line x1={15} y1={15} x2={20} y2={20} {...stroke(color, 1.7)} />
    <Line x1={8.5} y1={8} x2={8.5} y2={12} {...stroke(color, 1.4)} />
    <Line x1={11.5} y1={6.5} x2={11.5} y2={11} {...stroke(color, 1.4)} />
  </Svg>
);

export const InsightsIcon = ({ size = 20, color = "#000000" }: IconProps) => (
  // Three vertical bars + an arc connecting their tops.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Line x1={6} y1={20} x2={6} y2={14} {...stroke(color)} />
    <Line x1={12} y1={20} x2={12} y2={11} {...stroke(color)} />
    <Line x1={18} y1={20} x2={18} y2={8} {...stroke(color)} />
    <Path d="M6 11 Q 12 4 18 5" {...stroke(color, 1.4)} />
  </Svg>
);

export const PortfolioIcon = ({ size = 20, color = "#000000" }: IconProps) => (
  // Diamond divided into four quadrants — asset allocation.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polygon points="12,3 21,12 12,21 3,12" {...stroke(color)} />
    <Line x1={3} y1={12} x2={21} y2={12} {...stroke(color, 1.3)} />
    <Line x1={12} y1={3} x2={12} y2={21} {...stroke(color, 1.3)} />
  </Svg>
);

export const AlertIcon = ({ size = 20, color = "#000000" }: IconProps) => (
  // Zigzag price line with a vertical dashed threshold line crossing the spike.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polyline points="3,15 7,14 11,15 14,7 17,15 21,14" {...stroke(color)} />
    <Line x1={14} y1={3} x2={14} y2={21} stroke={color} strokeWidth={1.3} strokeDasharray="2 2" strokeLinecap="round" fill="none" />
  </Svg>
);

export const AccountIcon = ({ size = 20, color = "#000000" }: IconProps) => (
  // Small head + ascending bar chart for body.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={6} r={2.7} {...stroke(color)} />
    <Line x1={7.5} y1={20} x2={7.5} y2={16} {...stroke(color)} />
    <Line x1={12} y1={20} x2={12} y2={14} {...stroke(color)} />
    <Line x1={16.5} y1={20} x2={16.5} y2={12} {...stroke(color)} />
  </Svg>
);

export const AdminIcon = ({ size = 20, color = "#000000" }: IconProps) => (
  // Shield with checkmark inside.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M12 3 L20 6 V12 C20 16.5 16.5 20 12 21 C7.5 20 4 16.5 4 12 V6 Z" {...stroke(color)} />
    <Polyline points="9,12 11.5,14.5 15.5,10" {...stroke(color, 1.6)} />
  </Svg>
);

// ─── Action icons ────────────────────────────────────────────────────────────

export const AddIcon = ({ size = 20, color = "#000000" }: IconProps) => (
  // Rounded square with plus sign inside.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x={3} y={3} width={18} height={18} rx={4.5} ry={4.5} {...stroke(color)} />
    <Line x1={12} y1={8.5} x2={12} y2={15.5} {...stroke(color, 1.6)} />
    <Line x1={8.5} y1={12} x2={15.5} y2={12} {...stroke(color, 1.6)} />
  </Svg>
);

export const CloseIcon = ({ size = 20, color = "#000000" }: IconProps) => (
  // Soft X with rounded ends.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Line x1={6} y1={6} x2={18} y2={18} {...stroke(color, 1.7)} />
    <Line x1={18} y1={6} x2={6} y2={18} {...stroke(color, 1.7)} />
  </Svg>
);

export const SortAscIcon = ({ size = 16, color = "#000000" }: IconProps) => (
  // Two short horizontal lines + small upward chevron to the right.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Line x1={4} y1={9} x2={13} y2={9} {...stroke(color)} />
    <Line x1={4} y1={15} x2={13} y2={15} {...stroke(color)} />
    <Polyline points="17,12 19.5,9 22,12" {...stroke(color, 1.6)} />
  </Svg>
);

export const SortDescIcon = ({ size = 16, color = "#000000" }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Line x1={4} y1={9} x2={13} y2={9} {...stroke(color)} />
    <Line x1={4} y1={15} x2={13} y2={15} {...stroke(color)} />
    <Polyline points="17,12 19.5,15 22,12" {...stroke(color, 1.6)} />
  </Svg>
);

export const ExpandIcon = ({ size = 16, color = "#000000" }: IconProps) => (
  // Single downward chevron, slightly wider than tall.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polyline points="5,9 12,16 19,9" {...stroke(color, 1.7)} />
  </Svg>
);

export const CollapseIcon = ({ size = 16, color = "#000000" }: IconProps) => (
  // Single upward chevron.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polyline points="5,15 12,8 19,15" {...stroke(color, 1.7)} />
  </Svg>
);

export const LockIcon = ({ size = 16, color = "#000000" }: IconProps) => (
  // Padlock: rectangle body + arc shackle + tiny keyhole slot.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x={5} y={11} width={14} height={10} rx={2} ry={2} {...stroke(color)} />
    <Path d="M8 11 V8 a4 4 0 0 1 8 0 V11" {...stroke(color)} />
    <Line x1={12} y1={15} x2={12} y2={17} {...stroke(color, 1.4)} />
  </Svg>
);

export const TrendUpIcon = ({ size = 16, color = "#000000" }: IconProps) => (
  // 3-point zigzag rising, with a small filled arrowhead at the tip.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polyline points="3,17 9,12 13,15 19,7" {...stroke(color, 1.7)} />
    <Polygon points="19,7 16,7 19,10" fill={color} stroke={color} strokeWidth={1} />
  </Svg>
);

export const TrendDownIcon = ({ size = 16, color = "#000000" }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polyline points="3,7 9,12 13,9 19,17" {...stroke(color, 1.7)} />
    <Polygon points="19,17 19,14 16,17" fill={color} stroke={color} strokeWidth={1} />
  </Svg>
);

export const MenuIcon = ({ size = 20, color = "#000000" }: IconProps) => (
  // Three horizontal lines, middle line ~60% width.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Line x1={4} y1={6.5} x2={20} y2={6.5} {...stroke(color, 1.7)} />
    <Line x1={4} y1={12} x2={13.5} y2={12} {...stroke(color, 1.7)} />
    <Line x1={4} y1={17.5} x2={20} y2={17.5} {...stroke(color, 1.7)} />
  </Svg>
);

export const ExportIcon = ({ size = 16, color = "#000000" }: IconProps) => (
  // Tray (open-top rectangle) + arrow rising out the top.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polyline points="5,14 5,20 19,20 19,14" {...stroke(color)} />
    <Line x1={12} y1={4} x2={12} y2={15} {...stroke(color, 1.6)} />
    <Polyline points="8,8 12,4 16,8" {...stroke(color, 1.6)} />
  </Svg>
);

export const RefreshIcon = ({ size = 16, color = "#000000" }: IconProps) => (
  // 270° arc (3/4 circle) with arrowhead at the open end.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M19 12 a7 7 0 1 1 -2.05 -4.95" {...stroke(color, 1.6)} />
    <Polyline points="19,5 19,8 16,8" {...stroke(color, 1.6)} />
  </Svg>
);

export const FilterIcon = ({ size = 16, color = "#000000" }: IconProps) => (
  // Three horizontal lines of decreasing length — a line-drawn funnel.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Line x1={3} y1={7} x2={21} y2={7} {...stroke(color, 1.6)} />
    <Line x1={6} y1={12} x2={18} y2={12} {...stroke(color, 1.6)} />
    <Line x1={10} y1={17} x2={14} y2={17} {...stroke(color, 1.6)} />
  </Svg>
);

export const DeleteIcon = ({ size = 16, color = "#000000" }: IconProps) => (
  // Minimal trash can: lid line, body rectangle, two inner content bars.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Line x1={3.5} y1={6.5} x2={20.5} y2={6.5} {...stroke(color, 1.6)} />
    <Path d="M6 6.5 V20 a1.5 1.5 0 0 0 1.5 1.5 H16.5 a1.5 1.5 0 0 0 1.5 -1.5 V6.5" {...stroke(color)} />
    <Line x1={10} y1={11} x2={10} y2={17} {...stroke(color, 1.4)} />
    <Line x1={14} y1={11} x2={14} y2={17} {...stroke(color, 1.4)} />
  </Svg>
);

export const NotificationIcon = ({ size = 20, color = "#000000" }: IconProps) => (
  // Speech-bubble outline with two tiny bars inside (news pulse).
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M4 6 a2 2 0 0 1 2 -2 H18 a2 2 0 0 1 2 2 V14 a2 2 0 0 1 -2 2 H10 L6 20 V16 H6 a2 2 0 0 1 -2 -2 Z"
      {...stroke(color)}
    />
    <Line x1={9.5} y1={8} x2={9.5} y2={12} {...stroke(color, 1.4)} />
    <Line x1={13} y1={9.5} x2={13} y2={12} {...stroke(color, 1.4)} />
  </Svg>
);
