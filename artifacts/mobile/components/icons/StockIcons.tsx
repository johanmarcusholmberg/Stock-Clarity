// Custom StockClarity icon set — built from react-native-svg primitives so
// the same source renders on iOS, Android, and web. Phase 2 expands the set
// to cover every Feather icon used across native screens. See README.

import React from "react";
import Svg, { Path, Line, Circle, Polyline, Rect, G, Polygon, Ellipse } from "react-native-svg";

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

// stroke() builds the common stroke props. The third arg lets a caller
// override the icon's per-line default — used when callers pass strokeWidth
// to bump visibility at small sizes (≤14px).
const stroke = (color: string, width = 1.5, override?: number) => ({
  stroke: color,
  strokeWidth: override ?? width,
  fill: "none" as const,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

// ─── Navigation icons ────────────────────────────────────────────────────────

export const HomeIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polyline points="3,12 12,4 21,12" {...stroke(color, 1.5, strokeWidth)} />
    <Polyline points="5,11 5,20 19,20 19,11" {...stroke(color, 1.5, strokeWidth)} />
    <Polyline points="10,18 12,15 14,16 16,13" {...stroke(color, 1.6, strokeWidth)} />
  </Svg>
);

export const DigestIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Line x1={4} y1={7} x2={18} y2={7} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={4} y1={12} x2={15} y2={12} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={4} y1={17} x2={11} y2={17} {...stroke(color, 1.5, strokeWidth)} />
    <Circle cx={20.2} cy={7} r={1.6} fill={color} />
  </Svg>
);

export const SearchIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={10} cy={10} r={6.5} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={15} y1={15} x2={20} y2={20} {...stroke(color, 1.7, strokeWidth)} />
    <Line x1={8.5} y1={8} x2={8.5} y2={12} {...stroke(color, 1.4, strokeWidth)} />
    <Line x1={11.5} y1={6.5} x2={11.5} y2={11} {...stroke(color, 1.4, strokeWidth)} />
  </Svg>
);

export const InsightsIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Line x1={6} y1={20} x2={6} y2={14} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={12} y1={20} x2={12} y2={11} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={18} y1={20} x2={18} y2={8} {...stroke(color, 1.5, strokeWidth)} />
    <Path d="M6 11 Q 12 4 18 5" {...stroke(color, 1.4, strokeWidth)} />
  </Svg>
);

export const PortfolioIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polygon points="12,3 21,12 12,21 3,12" {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={3} y1={12} x2={21} y2={12} {...stroke(color, 1.3, strokeWidth)} />
    <Line x1={12} y1={3} x2={12} y2={21} {...stroke(color, 1.3, strokeWidth)} />
  </Svg>
);

export const AlertIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polyline points="3,15 7,14 11,15 14,7 17,15 21,14" {...stroke(color, 1.5, strokeWidth)} />
    <Line
      x1={14}
      y1={3}
      x2={14}
      y2={21}
      stroke={color}
      strokeWidth={strokeWidth ?? 1.3}
      strokeDasharray="2 2"
      strokeLinecap="round"
      fill="none"
    />
  </Svg>
);

export const BellOffIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // AlertIcon (price line + threshold) with a diagonal slash through it,
  // mirroring the Zap → ZapOff visual relationship.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polyline points="3,15 7,14 11,15 14,7 17,15 21,14" {...stroke(color, 1.5, strokeWidth)} />
    <Line
      x1={14}
      y1={3}
      x2={14}
      y2={21}
      stroke={color}
      strokeWidth={strokeWidth ?? 1.3}
      strokeDasharray="2 2"
      strokeLinecap="round"
      fill="none"
    />
    <Line x1={4} y1={4} x2={20} y2={20} {...stroke(color, 1.7, strokeWidth)} />
  </Svg>
);

export const AccountIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={6} r={2.7} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={7.5} y1={20} x2={7.5} y2={16} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={12} y1={20} x2={12} y2={14} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={16.5} y1={20} x2={16.5} y2={12} {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

export const AdminIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M12 3 L20 6 V12 C20 16.5 16.5 20 12 21 C7.5 20 4 16.5 4 12 V6 Z" {...stroke(color, 1.5, strokeWidth)} />
    <Polyline points="9,12 11.5,14.5 15.5,10" {...stroke(color, 1.6, strokeWidth)} />
  </Svg>
);

// ─── Action icons ────────────────────────────────────────────────────────────

export const AddIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x={3} y={3} width={18} height={18} rx={4.5} ry={4.5} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={12} y1={8.5} x2={12} y2={15.5} {...stroke(color, 1.6, strokeWidth)} />
    <Line x1={8.5} y1={12} x2={15.5} y2={12} {...stroke(color, 1.6, strokeWidth)} />
  </Svg>
);

export const CloseIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Line x1={6} y1={6} x2={18} y2={18} {...stroke(color, 1.7, strokeWidth)} />
    <Line x1={18} y1={6} x2={6} y2={18} {...stroke(color, 1.7, strokeWidth)} />
  </Svg>
);

export const SortAscIcon = ({ size = 16, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Line x1={4} y1={9} x2={13} y2={9} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={4} y1={15} x2={13} y2={15} {...stroke(color, 1.5, strokeWidth)} />
    <Polyline points="17,12 19.5,9 22,12" {...stroke(color, 1.6, strokeWidth)} />
  </Svg>
);

export const SortDescIcon = ({ size = 16, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Line x1={4} y1={9} x2={13} y2={9} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={4} y1={15} x2={13} y2={15} {...stroke(color, 1.5, strokeWidth)} />
    <Polyline points="17,12 19.5,15 22,12" {...stroke(color, 1.6, strokeWidth)} />
  </Svg>
);

export const ExpandIcon = ({ size = 16, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polyline points="5,9 12,16 19,9" {...stroke(color, 1.7, strokeWidth)} />
  </Svg>
);

export const CollapseIcon = ({ size = 16, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polyline points="5,15 12,8 19,15" {...stroke(color, 1.7, strokeWidth)} />
  </Svg>
);

export const LockIcon = ({ size = 16, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x={5} y={11} width={14} height={10} rx={2} ry={2} {...stroke(color, 1.5, strokeWidth)} />
    <Path d="M8 11 V8 a4 4 0 0 1 8 0 V11" {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={12} y1={15} x2={12} y2={17} {...stroke(color, 1.4, strokeWidth)} />
  </Svg>
);

export const TrendUpIcon = ({ size = 16, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polyline points="3,17 9,12 13,15 19,7" {...stroke(color, 1.7, strokeWidth)} />
    <Polygon points="19,7 16,7 19,10" fill={color} stroke={color} strokeWidth={1} />
  </Svg>
);

export const TrendDownIcon = ({ size = 16, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polyline points="3,7 9,12 13,9 19,17" {...stroke(color, 1.7, strokeWidth)} />
    <Polygon points="19,17 19,14 16,17" fill={color} stroke={color} strokeWidth={1} />
  </Svg>
);

export const MenuIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Line x1={4} y1={6.5} x2={20} y2={6.5} {...stroke(color, 1.7, strokeWidth)} />
    <Line x1={4} y1={12} x2={13.5} y2={12} {...stroke(color, 1.7, strokeWidth)} />
    <Line x1={4} y1={17.5} x2={20} y2={17.5} {...stroke(color, 1.7, strokeWidth)} />
  </Svg>
);

export const ExportIcon = ({ size = 16, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polyline points="5,14 5,20 19,20 19,14" {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={12} y1={4} x2={12} y2={15} {...stroke(color, 1.6, strokeWidth)} />
    <Polyline points="8,8 12,4 16,8" {...stroke(color, 1.6, strokeWidth)} />
  </Svg>
);

export const RefreshIcon = ({ size = 16, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M19 12 a7 7 0 1 1 -2.05 -4.95" {...stroke(color, 1.6, strokeWidth)} />
    <Polyline points="19,5 19,8 16,8" {...stroke(color, 1.6, strokeWidth)} />
  </Svg>
);

export const FilterIcon = ({ size = 16, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Line x1={3} y1={7} x2={21} y2={7} {...stroke(color, 1.6, strokeWidth)} />
    <Line x1={6} y1={12} x2={18} y2={12} {...stroke(color, 1.6, strokeWidth)} />
    <Line x1={10} y1={17} x2={14} y2={17} {...stroke(color, 1.6, strokeWidth)} />
  </Svg>
);

export const DeleteIcon = ({ size = 16, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Line x1={3.5} y1={6.5} x2={20.5} y2={6.5} {...stroke(color, 1.6, strokeWidth)} />
    <Path d="M6 6.5 V20 a1.5 1.5 0 0 0 1.5 1.5 H16.5 a1.5 1.5 0 0 0 1.5 -1.5 V6.5" {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={10} y1={11} x2={10} y2={17} {...stroke(color, 1.4, strokeWidth)} />
    <Line x1={14} y1={11} x2={14} y2={17} {...stroke(color, 1.4, strokeWidth)} />
  </Svg>
);

export const NotificationIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M4 6 a2 2 0 0 1 2 -2 H18 a2 2 0 0 1 2 2 V14 a2 2 0 0 1 -2 2 H10 L6 20 V16 H6 a2 2 0 0 1 -2 -2 Z"
      {...stroke(color, 1.5, strokeWidth)}
    />
    <Line x1={9.5} y1={8} x2={9.5} y2={12} {...stroke(color, 1.4, strokeWidth)} />
    <Line x1={13} y1={9.5} x2={13} y2={12} {...stroke(color, 1.4, strokeWidth)} />
  </Svg>
);

// ─── Feedback & Status ───────────────────────────────────────────────────────

export const CheckIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polyline points="5,12 10,17 19,7" {...stroke(color, 1.7, strokeWidth)} />
  </Svg>
);

export const CheckCircleIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={9} {...stroke(color, 1.5, strokeWidth)} />
    <Polyline points="8,12.5 11,15.5 16,9.5" {...stroke(color, 1.6, strokeWidth)} />
  </Svg>
);

export const AlertTriangleIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polygon points="12,3.5 21.5,20 2.5,20" {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={12} y1={10} x2={12} y2={14.5} {...stroke(color, 1.6, strokeWidth)} />
    <Circle cx={12} cy={17.5} r={0.9} fill={color} />
  </Svg>
);

export const AlertCircleIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={9} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={12} y1={7.5} x2={12} y2={13} {...stroke(color, 1.6, strokeWidth)} />
    <Circle cx={12} cy={16.2} r={0.9} fill={color} />
  </Svg>
);

export const InfoIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={9} {...stroke(color, 1.5, strokeWidth)} />
    <Circle cx={12} cy={7.8} r={0.9} fill={color} />
    <Line x1={12} y1={11} x2={12} y2={16.5} {...stroke(color, 1.6, strokeWidth)} />
  </Svg>
);

export const SlashIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Line x1={5} y1={19} x2={19} y2={5} {...stroke(color, 1.7, strokeWidth)} />
  </Svg>
);

// ─── Navigation & Action ─────────────────────────────────────────────────────

export const ChevronRightIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polyline points="9,5 16,12 9,19" {...stroke(color, 1.7, strokeWidth)} />
  </Svg>
);

export const ChevronLeftIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polyline points="15,5 8,12 15,19" {...stroke(color, 1.7, strokeWidth)} />
  </Svg>
);

export const ArrowLeftIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Line x1={4} y1={12} x2={20} y2={12} {...stroke(color, 1.6, strokeWidth)} />
    <Polyline points="9,7 4,12 9,17" {...stroke(color, 1.6, strokeWidth)} />
  </Svg>
);

export const ArrowRightIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Line x1={4} y1={12} x2={20} y2={12} {...stroke(color, 1.6, strokeWidth)} />
    <Polyline points="15,7 20,12 15,17" {...stroke(color, 1.6, strokeWidth)} />
  </Svg>
);

export const ExternalLinkIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Square with open top-right corner + diagonal arrow exiting through it.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polyline points="14,4 4,4 4,20 20,20 20,10" {...stroke(color, 1.5, strokeWidth)} />
    <Polyline points="14,4 20,4 20,10" {...stroke(color, 1.6, strokeWidth)} />
    <Line x1={11} y1={13} x2={20} y2={4} {...stroke(color, 1.6, strokeWidth)} />
  </Svg>
);

export const SendIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Paper plane: triangle pointing right with a notch back-left for the tail.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polygon points="3,3 21,12 3,21 7,12" {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={7} y1={12} x2={3} y2={3} {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

export const EditIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Pencil: shaft running from top-right to bottom-left, tip at bottom.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M16 3 L21 8 L8 21 L3 21 L3 16 Z" {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={14} y1={5} x2={19} y2={10} {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

export const SettingsIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Center circle + 6 spokes radiating at 60° intervals.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={3} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={16} y1={12} x2={20} y2={12} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={14} y1={15.5} x2={16} y2={19} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={10} y1={15.5} x2={8} y2={19} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={8} y1={12} x2={4} y2={12} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={10} y1={8.5} x2={8} y2={5} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={14} y1={8.5} x2={16} y2={5} {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

export const XCircleIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={9} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={9} y1={9} x2={15} y2={15} {...stroke(color, 1.6, strokeWidth)} />
    <Line x1={15} y1={9} x2={9} y2={15} {...stroke(color, 1.6, strokeWidth)} />
  </Svg>
);

export const XOctagonIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // 8-sided polygon with flat top/bottom/sides + 45° corners.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polygon points="8,3 16,3 21,8 21,16 16,21 8,21 3,16 3,8" {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={9} y1={9} x2={15} y2={15} {...stroke(color, 1.6, strokeWidth)} />
    <Line x1={15} y1={9} x2={9} y2={15} {...stroke(color, 1.6, strokeWidth)} />
  </Svg>
);

// ─── Content & Data ──────────────────────────────────────────────────────────

export const FileTextIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Document body with a folded top-right corner + 3 inner text lines.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M5 3 H14 L19 8 V21 H5 Z" {...stroke(color, 1.5, strokeWidth)} />
    <Polyline points="14,3 14,8 19,8" {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={8} y1={12} x2={16} y2={12} {...stroke(color, 1.4, strokeWidth)} />
    <Line x1={8} y1={15} x2={16} y2={15} {...stroke(color, 1.4, strokeWidth)} />
    <Line x1={8} y1={18} x2={13} y2={18} {...stroke(color, 1.4, strokeWidth)} />
  </Svg>
);

export const BookmarkIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Ribbon: rectangle with a V-notch cut from the bottom center.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M6 3 H18 V21 L12 17 L6 21 Z" {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

export const ClockIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={9} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={12} y1={12} x2={12} y2={7} {...stroke(color, 1.6, strokeWidth)} />
    <Line x1={12} y1={12} x2={16} y2={12} {...stroke(color, 1.6, strokeWidth)} />
  </Svg>
);

export const CalendarIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x={4} y={5} width={16} height={16} rx={1.5} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={4} y1={9} x2={20} y2={9} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={9} y1={3} x2={9} y2={6} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={15} y1={3} x2={15} y2={6} {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

export const LayersIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Three stacked rhombuses, top smallest, bottom largest.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polygon points="12,3 17,6.5 12,10 7,6.5" {...stroke(color, 1.5, strokeWidth)} />
    <Polygon points="12,8 19,12 12,16 5,12" {...stroke(color, 1.5, strokeWidth)} />
    <Polygon points="12,14 20,18 12,21 4,18" {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

export const GridIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x={3} y={3} width={18} height={18} rx={1.5} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={12} y1={3} x2={12} y2={21} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={3} y1={12} x2={21} y2={12} {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

export const ColumnsIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x={3} y={3} width={8} height={18} rx={1} {...stroke(color, 1.5, strokeWidth)} />
    <Rect x={13} y={3} width={8} height={18} rx={1} {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

export const ListIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Three horizontal lines with a small filled dot to the left of each.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={5} cy={6} r={1.2} fill={color} />
    <Circle cx={5} cy={12} r={1.2} fill={color} />
    <Circle cx={5} cy={18} r={1.2} fill={color} />
    <Line x1={9} y1={6} x2={20} y2={6} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={9} y1={12} x2={20} y2={12} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={9} y1={18} x2={20} y2={18} {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

export const MaximizeIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Four corner L-shapes, each pointing outward — "expand" / "fullscreen".
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polyline points="9,3 3,3 3,9" {...stroke(color, 1.6, strokeWidth)} />
    <Polyline points="15,3 21,3 21,9" {...stroke(color, 1.6, strokeWidth)} />
    <Polyline points="15,21 21,21 21,15" {...stroke(color, 1.6, strokeWidth)} />
    <Polyline points="9,21 3,21 3,15" {...stroke(color, 1.6, strokeWidth)} />
  </Svg>
);

// ─── Communication ───────────────────────────────────────────────────────────

export const MailIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Envelope: rounded rectangle body + V-flap inside near the top.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x={3} y={6} width={18} height={13} rx={1.5} {...stroke(color, 1.5, strokeWidth)} />
    <Polyline points="3,7 12,14 21,7" {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

export const MessageSquareIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Speech bubble: rounded rectangle with a small tail at bottom-left.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M5 4 H19 a2 2 0 0 1 2 2 V15 a2 2 0 0 1 -2 2 H10 L6 21 V17 H5 a2 2 0 0 1 -2 -2 V6 a2 2 0 0 1 2 -2 Z"
      {...stroke(color, 1.5, strokeWidth)}
    />
    <Line x1={8} y1={9} x2={16} y2={9} {...stroke(color, 1.4, strokeWidth)} />
    <Line x1={8} y1={13} x2={13} y2={13} {...stroke(color, 1.4, strokeWidth)} />
  </Svg>
);

export const AtSignIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Inner circle + outer arc (open at bottom-right) forming an @.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={4} {...stroke(color, 1.5, strokeWidth)} />
    <Path d="M16 8 V14 a3 3 0 0 0 6 -2 a10 10 0 1 0 -4 7" {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

export const RssIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Small dot in bottom-left + two concentric arcs above/right — a broadcast.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={5} cy={19} r={1.4} fill={color} />
    <Path d="M4 11 a8 8 0 0 1 9 9" {...stroke(color, 1.5, strokeWidth)} />
    <Path d="M4 4 a15 15 0 0 1 16 16" {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

// ─── Financial / Activity ────────────────────────────────────────────────────

export const ActivityIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Heartbeat / pulse: a flat baseline with one upward spike and back down.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polyline points="3,12 8,12 11,4 13,20 16,12 21,12" {...stroke(color, 1.6, strokeWidth)} />
  </Svg>
);

export const ZapIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Lightning bolt: 3-point zigzag, pointed at top and bottom.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polygon points="13,2 5,13 11,13 11,22 19,11 13,11" {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

export const ZapOffIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Lightning bolt with a diagonal slash from top-right to bottom-left.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polygon points="13,2 5,13 11,13 11,22 19,11 13,11" {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={20} y1={4} x2={4} y2={20} {...stroke(color, 1.7, strokeWidth)} />
  </Svg>
);

export const StarIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // 5-pointed star with alternating outer/inner radius vertices.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polygon
      points="12,3 14.4,9 20.6,9 15.8,13 17.3,19.5 12,16 6.7,19.5 8.2,13 3.4,9 9.6,9"
      {...stroke(color, 1.5, strokeWidth)}
    />
  </Svg>
);

export const CreditCardIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Card body + horizontal stripe near the top + chip in lower-left.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x={3} y={5} width={18} height={14} rx={2} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={3} y1={9} x2={21} y2={9} {...stroke(color, 1.5, strokeWidth)} />
    <Rect x={6} y={13} width={4} height={3} rx={0.5} {...stroke(color, 1.4, strokeWidth)} />
  </Svg>
);

export const GiftIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Box with a horizontal ribbon band, vertical band down the middle, and bow.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x={4} y={9} width={16} height={12} rx={1} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={4} y1={14} x2={20} y2={14} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={12} y1={9} x2={12} y2={21} {...stroke(color, 1.5, strokeWidth)} />
    <Path d="M12 9 C 9 5 5 6 8 9" {...stroke(color, 1.5, strokeWidth)} />
    <Path d="M12 9 C 15 5 19 6 16 9" {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

export const RefreshCcwIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Two opposing circular arrows — counter-clockwise refresh / reversal.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polyline points="3,3 3,9 9,9" {...stroke(color, 1.5, strokeWidth)} />
    <Polyline points="21,21 21,15 15,15" {...stroke(color, 1.5, strokeWidth)} />
    <Path d="M3 9 a9 9 0 0 1 16 -2" {...stroke(color, 1.5, strokeWidth)} />
    <Path d="M21 15 a9 9 0 0 1 -16 2" {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

export const ShuffleIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Two crossing diagonals, each with an arrowhead at its right end.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Line x1={3} y1={6} x2={20} y2={18} {...stroke(color, 1.5, strokeWidth)} />
    <Polyline points="17,16 20,18 19,15" {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={3} y1={18} x2={20} y2={6} {...stroke(color, 1.5, strokeWidth)} />
    <Polyline points="19,9 20,6 17,8" {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

// ─── People & Identity ───────────────────────────────────────────────────────

export const GlobeIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Outer circle + vertical longitude ellipse + horizontal equator.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={9} {...stroke(color, 1.5, strokeWidth)} />
    <Ellipse cx={12} cy={12} rx={4} ry={9} {...stroke(color, 1.4, strokeWidth)} />
    <Line x1={3} y1={12} x2={21} y2={12} {...stroke(color, 1.4, strokeWidth)} />
  </Svg>
);

export const LifeBuoyIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Outer ring + inner ring + 4 connecting arms at diagonals.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={9} {...stroke(color, 1.5, strokeWidth)} />
    <Circle cx={12} cy={12} r={4.5} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={5.5} y1={5.5} x2={9} y2={9} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={18.5} y1={5.5} x2={15} y2={9} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={5.5} y1={18.5} x2={9} y2={15} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={18.5} y1={18.5} x2={15} y2={15} {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

export const CpuIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Outer chip square + inner core + 8 short pin lines (2 per side).
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x={5} y={5} width={14} height={14} rx={1.5} {...stroke(color, 1.5, strokeWidth)} />
    <Rect x={9} y={9} width={6} height={6} rx={0.5} {...stroke(color, 1.4, strokeWidth)} />
    <Line x1={10} y1={2} x2={10} y2={5} {...stroke(color, 1.4, strokeWidth)} />
    <Line x1={14} y1={2} x2={14} y2={5} {...stroke(color, 1.4, strokeWidth)} />
    <Line x1={10} y1={19} x2={10} y2={22} {...stroke(color, 1.4, strokeWidth)} />
    <Line x1={14} y1={19} x2={14} y2={22} {...stroke(color, 1.4, strokeWidth)} />
    <Line x1={2} y1={10} x2={5} y2={10} {...stroke(color, 1.4, strokeWidth)} />
    <Line x1={2} y1={14} x2={5} y2={14} {...stroke(color, 1.4, strokeWidth)} />
    <Line x1={19} y1={10} x2={22} y2={10} {...stroke(color, 1.4, strokeWidth)} />
    <Line x1={19} y1={14} x2={22} y2={14} {...stroke(color, 1.4, strokeWidth)} />
  </Svg>
);

export const GitBranchIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Two small node circles + a vertical branch line and a curved branch line.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Line x1={6} y1={4.5} x2={6} y2={19.5} {...stroke(color, 1.5, strokeWidth)} />
    <Circle cx={6} cy={3} r={2} {...stroke(color, 1.5, strokeWidth)} />
    <Circle cx={6} cy={21} r={2} {...stroke(color, 1.5, strokeWidth)} />
    <Circle cx={18} cy={9} r={2} {...stroke(color, 1.5, strokeWidth)} />
    <Path d="M16 9 a8 8 0 0 1 -10 8" {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

// ─── Visibility ──────────────────────────────────────────────────────────────

export const EyeIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Almond/lens shape with a pupil circle in the center.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M2 12 C 5 6 9 4 12 4 C 15 4 19 6 22 12 C 19 18 15 20 12 20 C 9 20 5 18 2 12 Z" {...stroke(color, 1.5, strokeWidth)} />
    <Circle cx={12} cy={12} r={3} {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

export const EyeOffIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Eye + diagonal slash from top-right to bottom-left.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M2 12 C 5 6 9 4 12 4 C 15 4 19 6 22 12 C 19 18 15 20 12 20 C 9 20 5 18 2 12 Z" {...stroke(color, 1.5, strokeWidth)} />
    <Circle cx={12} cy={12} r={3} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={21} y1={3} x2={3} y2={21} {...stroke(color, 1.7, strokeWidth)} />
  </Svg>
);

// ─── Utility ─────────────────────────────────────────────────────────────────

export const WifiOffIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Three concentric arcs + dot below + diagonal slash through them.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M2 9 a14 14 0 0 1 20 0" {...stroke(color, 1.5, strokeWidth)} />
    <Path d="M5 13 a9 9 0 0 1 14 0" {...stroke(color, 1.5, strokeWidth)} />
    <Path d="M9 17 a4.5 4.5 0 0 1 6 0" {...stroke(color, 1.5, strokeWidth)} />
    <Circle cx={12} cy={20} r={1} fill={color} />
    <Line x1={4} y1={4} x2={20} y2={20} {...stroke(color, 1.7, strokeWidth)} />
  </Svg>
);

export const FolderIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Folder body with a small tab extending from the top-left.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M3 7 a2 2 0 0 1 2 -2 H9 L11 7 H19 a2 2 0 0 1 2 2 V18 a2 2 0 0 1 -2 2 H5 a2 2 0 0 1 -2 -2 Z"
      {...stroke(color, 1.5, strokeWidth)}
    />
  </Svg>
);

export const FolderMinusIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M3 7 a2 2 0 0 1 2 -2 H9 L11 7 H19 a2 2 0 0 1 2 2 V18 a2 2 0 0 1 -2 2 H5 a2 2 0 0 1 -2 -2 Z"
      {...stroke(color, 1.5, strokeWidth)}
    />
    <Line x1={9} y1={13.5} x2={15} y2={13.5} {...stroke(color, 1.6, strokeWidth)} />
  </Svg>
);

export const InboxIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Tray body + sloped tops + a U-shape carved into the front lip.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polyline points="22,12 16,12 14,15 10,15 8,12 2,12" {...stroke(color, 1.5, strokeWidth)} />
    <Path d="M5.5 5 L2 12 V18 a2 2 0 0 0 2 2 H20 a2 2 0 0 0 2 -2 V12 L18.5 5 Z" {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

export const MinusIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Line x1={5} y1={12} x2={19} y2={12} {...stroke(color, 1.7, strokeWidth)} />
  </Svg>
);

export const PrinterIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Printer body + paper feed on top + output tray + slot vents.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polyline points="6,9 6,3 18,3 18,9" {...stroke(color, 1.5, strokeWidth)} />
    <Path d="M6 18 H4 a2 2 0 0 1 -2 -2 V11 a2 2 0 0 1 2 -2 H20 a2 2 0 0 1 2 2 V16 a2 2 0 0 1 -2 2 H18" {...stroke(color, 1.5, strokeWidth)} />
    <Rect x={6} y={14} width={12} height={7} {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

// ─── Geometry ────────────────────────────────────────────────────────────────

export const CircleIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // A plain circle outline — used as the "unmet" companion to CheckCircleIcon.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={9} {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

// ─── Sharing & Loading ───────────────────────────────────────────────────────

export const Share2Icon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Three node circles (top-right, bottom-right, left) connected by two lines.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={18} cy={5} r={2.5} {...stroke(color, 1.5, strokeWidth)} />
    <Circle cx={6} cy={12} r={2.5} {...stroke(color, 1.5, strokeWidth)} />
    <Circle cx={18} cy={19} r={2.5} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={8.2} y1={10.7} x2={15.8} y2={6.3} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={8.2} y1={13.3} x2={15.8} y2={17.7} {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

export const LoaderIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Eight short rays around a center point — a static spinner shape.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Line x1={12} y1={2.5} x2={12} y2={6} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={12} y1={18} x2={12} y2={21.5} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={2.5} y1={12} x2={6} y2={12} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={18} y1={12} x2={21.5} y2={12} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={5.2} y1={5.2} x2={7.7} y2={7.7} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={16.3} y1={16.3} x2={18.8} y2={18.8} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={5.2} y1={18.8} x2={7.7} y2={16.3} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={16.3} y1={7.7} x2={18.8} y2={5.2} {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

// ─── Misc ────────────────────────────────────────────────────────────────────

export const MoreHorizontalIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Three filled dots in a horizontal row.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={5} cy={12} r={1.4} fill={color} />
    <Circle cx={12} cy={12} r={1.4} fill={color} />
    <Circle cx={19} cy={12} r={1.4} fill={color} />
  </Svg>
);

// ─── Playback ────────────────────────────────────────────────────────────────

export const PauseIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Two thick vertical bars side by side.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x={6} y={4} width={4} height={16} rx={0.5} {...stroke(color, 1.5, strokeWidth)} />
    <Rect x={14} y={4} width={4} height={16} rx={0.5} {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

export const PlayIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // A right-pointing triangle.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Polygon points="6,4 20,12 6,20" {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

// ─── Theme ───────────────────────────────────────────────────────────────────

export const SunIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Center circle + 8 short rays at 45° intervals.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={3.5} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={12} y1={2.5} x2={12} y2={5} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={12} y1={19} x2={12} y2={21.5} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={2.5} y1={12} x2={5} y2={12} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={19} y1={12} x2={21.5} y2={12} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={5.2} y1={5.2} x2={7} y2={7} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={17} y1={17} x2={18.8} y2={18.8} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={5.2} y1={18.8} x2={7} y2={17} {...stroke(color, 1.5, strokeWidth)} />
    <Line x1={17} y1={7} x2={18.8} y2={5.2} {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);

export const MoonIcon = ({ size = 20, color = "#000000", strokeWidth }: IconProps) => (
  // Crescent moon: outer arc + inner arc, opening to the right.
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M21 12.8 A 9 9 0 1 1 11.2 3 A 7 7 0 0 0 21 12.8 Z" {...stroke(color, 1.5, strokeWidth)} />
  </Svg>
);
