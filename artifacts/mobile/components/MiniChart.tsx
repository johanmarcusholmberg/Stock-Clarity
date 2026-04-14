import React, { useMemo } from "react";
import { View } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";

interface Props {
  data: number[];
  color: string;
  width: number;
  height: number;
}

export default function MiniChart({ data, color, width, height }: Props) {
  const path = useMemo(() => {
    if (!data || data.length < 2) return "";
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const points = data.map((val, i) => ({
      x: (i / (data.length - 1)) * width,
      y: height - ((val - min) / range) * height,
    }));

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const cp1x = points[i - 1].x + (points[i].x - points[i - 1].x) / 2;
      const cp1y = points[i - 1].y;
      const cp2x = points[i - 1].x + (points[i].x - points[i - 1].x) / 2;
      const cp2y = points[i].y;
      d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${points[i].x} ${points[i].y}`;
    }
    return d;
  }, [data, width, height]);

  if (!path) return <View style={{ width, height }} />;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.3" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={path} stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" />
    </Svg>
  );
}
